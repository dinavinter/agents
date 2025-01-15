/// <reference types="@edge-runtime/types" />

import {type serviceHub,createYjsHub} from "@/stream/hub.ts";
// import {serviceMachine} from "@/inspect/inspector.ts";
import {
    ActorRefFrom, AnyActorLogic,
    AnyStateMachine,
    assign,
    createActor,
    createMachine,
    emit,
    StateMachine
} from "xstate";
import {EdgeRuntime, runServer} from 'edge-runtime'
import {fileURLToPath} from "node:url";
import path from "node:path";
import {HocuspocusProvider} from "@hocuspocus/provider";
import {env} from "node:process";
import YPartyKitProvider from "y-partykit/provider"; 
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
globalThis.__filename = __filename;
globalThis.__dirname = __dirname;
import * as Y from "yjs";
 import YProvider from "y-partykit/provider";
import ws from "ws";



export async function createVM(code:string, id:string) {

     function createHub(url:string, doc:string) {
         // return createYjsHub(new Y.Doc({
         //     guid: doc,
         //     collectionid: collectionid,
         //     gc: false,
         // }))
        const provider= new YProvider(url, doc, undefined,{
            disableBc: true,
            WebSocketPolyfill: WebSocket,
            connect:false
        });
        
        const hub= createYjsHub(provider.doc);
        provider.connect();
       
        return Object.assign(hub, {room: provider.roomname});
        
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


        function encodeJson   (readable: ReadableStream)   {
            return readable.pipeThrough(new  TransformStream({
                transform(chunk, controller) {
                    controller.enqueue(JSON.stringify(chunk) + '\n');
                }
            }) ).pipeThrough(new TextEncoderStream())
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
            Y,
            YProvider,
            createYjsHub,
            createActor(logic: AnyActorLogic, hub: serviceHub) {
                return createActor(logic, {
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
            __filename,
            __dirname
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

type InferFromPromise<T> = T extends Promise<infer U> ? U : never
export type ActorVm = InferFromPromise<ReturnType<typeof createVM>>