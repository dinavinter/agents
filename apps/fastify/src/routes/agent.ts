import {FastifyPluginAsyncZod, jsonSchemaTransform} from "fastify-type-provider-zod";
import {AnyStateMachine, createMachine, EventObject, StateMachine} from "xstate";
import {z} from "zod";
import {statechartSchema} from '../plugins/doc/xstate.zod'
import {FastifyPluginAsyncJsonSchemaToTs, JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
 
import xstateSchema from '../plugins/doc/xstate.schema.json'
import {yArrayIterator} from "agent/stream/yjs";
import {EventMessage} from "fastify-sse-v2";
import "../plugins/xstate";
import type {FastifyInstance} from "fastify";
import {fileURLToPath} from "node:url";
import path from "node:path";
const routes: FastifyPluginAsyncJsonSchemaToTs = async function (instance:FastifyInstance, options) {
    const fastify = instance.withTypeProvider<JsonSchemaToTsProvider>()
    fastify.route({
        method: 'post',
        url: '/agents/json',
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
        method: 'post',
        url: '/agents/:agent/workers',
        schema: {
            summary: 'Create a worker instance for an agent',
            body: {
                type: 'object',
                properties: {
                    input: {
                        type: 'object',
                        description: 'The input data to the worker'
                    }
                }
            },
            response: {
                201: {
                    'application/json': {
                        description: 'Successful response',
                        type: 'object',
                        properties: {
                            id: {type: 'string'},
                            _links: {
                                type: 'object',
                                properties: {
                                    self: {type: 'string'},
                                    events: {type: 'string', format: 'uri'},
                                }
                            }
                        }
                    }
                }
            }
        },
        async handler(request, reply) {
            const {agent} = request.params as { agent: string };
            const {input} = request.body as { input: object };
            const worker = await instance.agent(agent).worker(worker).start(input);

            reply.type('application/json');
            reply.status(201);
            reply.header('Location', `${request.originalUrl}/${worker.id}`);
            return reply.send( {
                id: worker.id,
                _links: {
                    self: `${request.originalUrl}/${worker.id}`,
                    events: `${request.originalUrl}/${worker.id}/events`
                }
            });
        }
    })


    fastify.route({
        method: 'get',
        url: '/agents/:agent/workers/:worker',
        schema: {
            summary: 'Get a worker instance for an agent',
            params: {
                agent: {type: 'string'},
                worker: {type: 'string'}
            },
            response: {
                200: {
                    'application/json': {
                        description: 'Successful response',
                        type: 'object',
                        properties: {
                            id: {type: 'string'},
                            version: {type: 'string'},
                            state: {type: 'string'},
                            session: {type: 'string'},
                            _links: {
                                type: 'object',
                                properties: {
                                    self: {type: 'string'},
                                    events: {type: 'string', format: 'uri'},
                                }
                            }
                        }
                    }
                }
            }
        },
        async handler(request, reply) {
            const {agent, worker} = request.params as { agent: string };
            const logic =  instance.agent(agent).worker(worker).start();
            reply.type('application/json');
            reply.header('x-state', logic.getSnapshot().context.service.getSnapshot().value);
            reply.header('x-session', logic.sessionId);
            reply.header('x-worker', logic.id);
            return reply.send({
                id:  logic.id,
                state: logic.getSnapshot().value,
                _links: {
                    self: request.originalUrl,
                    events: `${request.originalUrl}/events`
                }
            });
        }
    })

    fastify.route( {
        method: "get",
        url: '/agents/:agent/workers/:worker/events',
        schema: {
            summary: 'SSE events of a worker',
            params: {
                agent: {type: 'string'},
                worker: {type: 'string'}
            },
            response: {
                200: {
                    'text/event-stream': {
                        description: 'Successful response',
                        type: 'string',
                    }
                }
            },
            produces: ['text/event-stream']
        },
        handler(request, reply) {
            const {agent, worker} = request.params as { agent: string };
            const {doc} = instance.agent(agent).worker(worker);
            const events = yArrayIterator(doc.getArray<EventMessage & EventObject>('events'));
            reply.sse(events);
        }
    })


}
 

    
 

    
    
export default routes;
