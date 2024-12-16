import fp from "fastify-plugin";
import * as Y from "yjs";
import {ActorVm, createVM} from "./vm.ts";
import {t} from "../yjs.type";
import type {Code} from "../repl/revision";
import {createYjsHub, type serviceHub} from "@/stream/hub.ts";
import YProvider from "y-partykit/provider";
import {env} from "node:process";
import {EdgeRuntime, runServer} from "edge-runtime";
import {ActorRefFrom, AnyActorLogic, AnyStateMachine, assign, createActor, createMachine, emit} from "xstate";
import ws from "ws";
import {serviceMachine} from "@/inspect/inspector.ts";

declare module "fastify" {
    interface VMI{
        start: ()=>Promise<ActorVm>,
        stop: ()=>Promise<void>
    }
    interface FastifyInstance {
        vm(docId: Y.Doc | string): VMI
    }
    
  
    interface Agent {
        start: VMI["start"],
        stop: VMI["stop"],
    }
    interface VMDoc extends Y.Doc {
        start:VMI["start"],
        stop:VMI["stop"]
    }
        
}

async function getOrCreate<TKey, TValue>(map:Map<TKey, TValue>, key:TKey, create:()=>PromiseLike<TValue>){
    if(!map.has(key)){
        map.set(key, await create())
    }
    return map.get(key)!;
}

const defaults = {handler: env.HANDLER_ID || "fastify"} 
export const agentRunnerPlugin = fp(async (fastify, options) => {
    const {handler} = Object.assign(defaults, options);
    const observers = new Map<string, ActorVm>();
    const discovery = fastify.docs.getOrCreate(":discovery");
 
    fastify.decorate("vm",  function (docId:Y.Doc | string) {
        const id = typeof docId === "string" ? docId : docId.guid
        const doc = docId instanceof Y.Doc ? docId : fastify.docs.getOrCreate(id);
         async function createVM(code:string, id:string) {

            function createHub() { 
                const hub= createYjsHub(doc);

                return Object.assign(hub, {room: doc.guid});

            }
            function router(hub:serviceHub & {room:string}) {

                return (event: FetchEvent) => {
                    const request = event.request;
                    if (request.url.includes('/sse')) {
                        return yjsSseRouter(event)
                    }
                    if (request.url.includes('/json')) {
                        return jsonRouter(event)
                    }
                    if (request.url.includes('/doc')) {
                        return docRouter(event)
                    }
                    return event.respondWith(new Response(JSON.stringify(hub.state), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'no-cache',
                            'Access-Control-Allow-Origin': '*'
                        }
                    }));

                    function yjsSseRouter(event: FetchEvent) {
                        const request = event.request;
                        const slug = request.url.split('/').pop() || 'emitted';
                        return event.respondWith(new Response(encodeSse(hub.array(slug).readableStream(event.request.signal)), {
                            headers: {
                                'Content-Type': 'text/event-stream',
                                'Cache-Control': 'no-cache',
                                'Access-Control-Allow-Origin': '*'
                            }
                        }))
                    }


                    function jsonRouter(event: FetchEvent) {
                        return event.respondWith(new Response(JSON.stringify(hub.state), {
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-cache',
                                'Access-Control-Allow-Origin': '*'
                            }
                        }));

                    }

                    function docRouter(event: FetchEvent) {
                        const doc=Array.from(hub.doc.share.entries()).reduce((acc, [key, value]) => {
                            acc[key] = value.toJSON();
                            return acc
                        }, {} as Record<string, any>);
                        return event.respondWith(new Response(JSON.stringify({room:hub.room, guid: hub.doc.guid , collectionid:hub.doc.collectionid, synced: hub.doc.isSynced,  ...doc}), {
                            headers: {
                                'Content-Type': 'application/json',
                                'Cache-Control': 'no-cache',
                                'Access-Control-Allow-Origin': '*'
                            }
                        }));
                    }


                }


                 

                function encodeSse   (readable: ReadableStream) {
                    return readable.pipeThrough(new TransformStream({
                        transform(chunk, controller) {
                            controller.enqueue(`data: ${JSON.stringify(chunk.data || chunk)}\n\n`);
                        }
                    })).pipeThrough(new TextEncoderStream())
                }
            }

            const machineCode = (code: string) => ` 
               const logic = ${code}; 
                ${createHub}
               const hub = createHub("${env.YJS_URL|| "ws://localhost:1999"}",  "${id}");
                const actor = createActor(logic, hub).start(); 
                // provider.connect();
                ${router} 
               addEventListener('fetch', router(hub))
             
            `
            // const provider = new HocuspocusProvider({
            //     url: env.YJS_URL!,
            //     name: hub.doc.guid,
            //     preserveConnection: true,
            //     document: hub.doc, 
            // })
            const runtime = new EdgeRuntime({
                initialCode: machineCode(code),
                extend: (context) => Object.assign(context, {
                    process: {env: {NODE_ENV: 'development'}},
                    emit,
                    // provider,
                    WebSocket:ws,
                    createMachine,
                    assign,
                    doc,
                    Y,
                    YProvider,
                    createYjsHub,
                    createActor(logic: AnyActorLogic, hub: serviceHub) {
                        return createActor(serviceMachine, {
                            id: 'service',
                            input: {
                                logic: logic,
                                hub: hub,
                            },
                            inspect: {
                                next: (e) => {
                                    e.type === '@xstate.event' && console.log(e)
                                }
                            }
                        });
                    },
                    // __filename,
                    // __dirname
                })
            })
            const server = await runServer({runtime, host: '0.0.0.0'})
            console.log(`Listening at ${server.url}.`)
            const logic = runtime.evaluate('logic') as AnyStateMachine
            const actor = runtime.evaluate('actor') as ActorRefFrom<AnyStateMachine>
            const hub = runtime.evaluate('hub') as serviceHub
            hub.doc.getMap().set("href", server.url)

            return {
                logic,
                actor,
                server,
                hub,
                href: server.url,
                // provider
            }
        }

        return {
            start() {
                return getOrCreate(observers, id, async function () {
                    const vm = await createVM(t<Code>(doc.getMap()).get("src"), id);

                    discovery.transact(()=>{
                        discovery.getMap(id).set("href", vm.href);
                        discovery.getMap(id).set("rev", doc.getMap().get("rev"));
                        discovery.getMap(id).set("timestamp", Date.now());
                        discovery.getMap(id).set("handler", handler );
                    }); 

                    return vm;
                })
            },
            async stop() {
                const vm = observers.get(id);
                if(vm) {
                    await vm?.server?.close();
                    discovery.getMap().delete(id);
                    observers.delete(id);
                }
            }
        }
    })
    
    
    fastify["agent.extensions"].push( function (agent) {
          
        const createSnapshot = agent.createSnapshot.bind(agent);
        const revision = agent.revision.bind(agent);
        
        return {

            start: async function () {
                const snapshot = createSnapshot();
                return fastify.vm(snapshot).start()
            },
            stop: async function () {
                const discovery = agent.getMap("discovery");
                for (const [key,] of discovery) {
                    await fastify.vm(key).stop()
                }
            },
            createSnapshot: function () {
                const snapshot = createSnapshot();
                return Object.assign(snapshot, fastify.vm(snapshot))
            },
            revision: function (rev: string) {
                const snapshot = revision(rev);
                return snapshot && Object.assign(snapshot, fastify.vm(snapshot))
            }
        }
                
    })

});


export default agentRunnerPlugin;