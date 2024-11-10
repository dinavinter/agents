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
 import {serviceMachine} from "agent/inspect/inspector";
import {createYjsHub} from "agent/stream/hub";

const routes: FastifyPluginAsyncJsonSchemaToTs = async function (instance: FastifyInstance, options) {
    const fastify = instance.withTypeProvider<JsonSchemaToTsProvider>()
    const  example=` createMachine({
                    id: 'emit-example',
                    initial: 'emit',
                    context:{
                        index: 0
                    },
                    states: {
                        emit: {
                            entry: assign({
                                index: ({context: {index}}) => index + 1
                            }),
                            after: {
                                1000: {
                                    target: 'emit',
                                    reenter: true,
                                    actions: emit(({context: {index}}) => ({
                                        type: 'EMIT',
                                        data: index,
                                        event: 'emit'
                                    }))
                                }
                            },
                        }
                    }
                })`
    fastify.log.info('example', example)
    fastify.route({
        method: 'post',
        url: '/agents/from-js',
        schema: {
            summary: 'Post Agent Code',
            description: 'This route is to create an agent definition',
            body: { 
               type: 'object',
                description: 'The agent javascript code',
                // examples: [ {
                //     code: example
                // }],
                properties: {
                    code: {
                        type: 'string',
                        description: 'The agent javascript code',
                        examples: [example]
                    }
                }
            },
            response: {
                201: {
                    description: 'Successful response',
                    type: 'object',
                    properties: {
                        id: {type: 'string'},
                        version: {type: 'string'},
                        links: {
                            type: 'object',
                            properties: {
                                self: {type: 'string'},
                                workers: {type: 'string'}
                            }
                        }
                    }
                }
            }
        },
        async handler(request, reply) {
            const {code}= request.body
            function actor(machine: StateMachine<any, any, any>, hub: ReturnType<typeof createYjsHub>) {
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
            }
            
            


            const machineCode =(code:string) => ` 
                const machine = ${code}; 
               const hub = createYjsHub();
               const service = actor(machine, hub).start(); 
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
                    actor,
                    routes,
                    createYjsHub, 
                    encodeJson,
                    encodeSse
                })
            })
            const server = await runServer({runtime , host: 'local.zon.cx'})
            console.log(`Listening at ${server.url}.`)

            const {id, version, definition, config, implementations} = runtime.evaluate('machine') as AnyStateMachine
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
                version: version ?? '0.0.0',
                config: config,
                definition: definition,
                implementations: implementations, 
                links: {
                    self: server.url,
                    workers: `/agents/${id}/workers`
                }
            }));
        }
    })

    fastify.route({
        method: 'post',
        url: '/agents',
        schema: {
            summary: 'Post Agent',
            description: 'This route is to create an agent definition',
            body: xstateSchema,
            response: {
                201: {
                    description: 'Successful response',
                    type: 'object',
                    properties: {
                        id: {type: 'string'},
                        version: {type: 'string'},
                        links: {
                            type: 'object',
                            properties: {
                                self: {type: 'string'},
                                workers: {type: 'string'}
                            }
                        }
                    }
                }
            }


        },
        async handler(request, reply) {
            const config = request.body as AnyStateMachine["config"];
            const {id, version} = instance.agent(config.id).configure(request.body)
            reply.type('application/json');
            return reply.send({
                id,
                version,
                links: {
                    self: `/agents/${id}`,
                    workers: `/agents/${id}/workers`
                }
            });
        }
    })

    fastify.route({
        method: 'get',
        url: '/agents/:agent',
        schema: {
            summary: 'Get an agent definition',
            response: {
                200: {
                    description: 'Successful response',
                    type: 'object',
                    properties: {
                        id: {type: 'string'},
                        version: {type: 'string'},
                        config: {type: 'object'},
                        definition: {type: 'object'},
                        links: {
                            type: 'object',
                            properties: {
                                self: {type: 'string'},
                                workers: {type: 'string'}
                            }
                        }
                    }
                }
            }
        },
        async handler(request, reply) {
            const {agent} = request.params as { agent: string };
            const {version, id, implementations, config, definition} = instance.agent(agent).logic();
            reply.type('application/json');
            reply.status(200);
            return reply.send(JSON.stringify({
                id: id,
                version: version ?? '0.0.0',
                config: config,
                definition: definition,
                links: {
                    self: request.originalUrl,
                    workers: `/agents/${id}/workers`
                }
            }));
        }
    })

}

export default routes;