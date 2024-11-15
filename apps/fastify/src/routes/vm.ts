import {createYjsHub, type serviceHub} from "agent/stream/hub";
import {serviceMachine} from "agent/inspect/inspector";
import {FastifyPluginAsyncJsonSchemaToTs, JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type {FastifyInstance} from "fastify";
import xstateSchema from "../plugins/doc/xstate.schema.json";
import {
    ActorRefFrom,
    AnyActorRef,
    AnyStateMachine,
    assign,
    createActor,
    createMachine,
    emit, Snapshot,
    StateMachine
} from "xstate";
import {EdgeRuntime, runServer} from 'edge-runtime'


function router(hub:Y.Doc) {
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
            return event.respondWith(new Response(encodeSse(hub[slug].readableStream()), {
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


export async function vm(code:string, hub:serviceHub) {
    const machineCode = (code: string) => ` 
               const logic = ${code}; 
                const actor = createActor(logic, hub).start(); 
                ${router} 
               addEventListener('fetch', router(hub))
            `
    const runtime = new EdgeRuntime({
        initialCode: machineCode(code),
        extend: (context) => Object.assign(context, {
            process: {env: {NODE_ENV: 'development'}},
            emit,
            createMachine,
            assign,
            createActor(machine: StateMachine<any, any, any>) {
                return createActor(serviceMachine, {
                    logic: machine,
                    id: 'service',
                    input: {
                        logic: machine,
                        hub: hub,
                    },
                    inspect: {
                        next: (e) => {
                            e.type === '@xstate.event' && console.log(e)
                        }
                    }
                });
            },
            hub
        })
    })
    const server = await runServer({runtime, host: 'local.zon.cx'})
    console.log(`Listening at ${server.url}.`)
    const logic = runtime.evaluate('logic') as AnyStateMachine
    const actor = runtime.evaluate('actor') as ActorRefFrom<AnyStateMachine>
    // const hub = runtime.evaluate('hub') as serviceHub

    return {
        logic,
        actor,
        server,
        hub,
        href: server.url
    }
}

type InferFromPromise<T> = T extends Promise<infer U> ? U : never
export type ActorVm = InferFromPromise<ReturnType<typeof vm>>