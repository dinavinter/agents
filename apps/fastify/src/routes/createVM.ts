/// <reference types="@edge-runtime/types" />

import {type serviceHub} from "agent/stream/hub";
import {serviceMachine} from "agent/inspect/inspector";
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
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
globalThis.__filename = __filename;
globalThis.__dirname = __dirname;


function router(hub:serviceHub) {
    return (event: FetchEvent) => {
        const request = event.request;
        if (request.url.includes('/sse')) {
            return yjsSseRouter(event)
        }
        if (request.url.includes('/json')) {
            return jsonRouter(event)
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


export async function createVM(code:string, hub:serviceHub) {
    const machineCode = (code: string) => ` 
               const logic = ${code}; 
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
            createMachine,
            assign,
            createActor(logic: AnyActorLogic) {
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
            hub,
            __filename,
            __dirname
        })
    })
    const server = await runServer({runtime, host: '0.0.0.0'})
    hub.doc.getMap().set("href", server.url)
    console.log(`Listening at ${server.url}.`)
    const logic = runtime.evaluate('logic') as AnyStateMachine
    const actor = runtime.evaluate('actor') as ActorRefFrom<AnyStateMachine>
    // const hub = runtime.evaluate('hub') as serviceHub
    
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