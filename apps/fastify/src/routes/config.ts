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
import {vm} from "./vm";
import '../plugins/xstate'
import {Code} from "../plugins/xstate";
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
        url: '/agents',
        schema: {
            summary: 'New Agent',
            description: 'This route is to create an agent definition',
            body: { 
               type: 'object',
                description: 'The agent javascript code',
                properties: {
                    id: {type: 'string' , examples: ['emit']},
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
            const {code, id}= request.body 
            
            const {src, vm}= fastify.agent(id);
            const codeItem=new Code(code);
            src.push([{
                ...codeItem
            }]);
            const{rev, timestamp, href, version, session} =await vm()  ;
            console.log(`Listening at ${href}.`)
 
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
                rev: rev,
                timestamp: timestamp,
                session: session,
                version: version ?? '0.0.0',
                code: code,
                links: {
                    self: `/agents/${id}`,
                    worker: href
                 }
            }));
        }
    })
    fastify.route({
        method: 'post',
        url: '/agents/:agent',
        schema: {
            summary: 'Post Specific Agent Code',
            description: 'This route is to create an agent definition',
            body: {
                type: 'object',
                description: 'The agent javascript code',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The agent javascript code',
                        examples: [example]
                    }
                }
            },
            response: {
                200: {
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

            
            const {src, vm}= fastify.agent(request.params.agent);
            const codeItem=new Code(code);
            src.push([{
                ...codeItem
            }]);
           const{rev, timestamp, href, version,id, session} =await vm()  ;
            // const server = await runServer({runtime , host: 'local.zon.cx'})
            console.log(`Listening at ${href}.`) 
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
                rev: rev,
                timestamp: timestamp,
                session: session,
                version: version ?? '0.0.0',
                code: code,
                links: {
                    self: request.originalUrl,
                    worker: href
                }
            }));
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
            const{rev, timestamp, href, version, session, id} =await fastify.agent(agent).vm()  ;
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
                rev: rev,
                timestamp: timestamp,
                session: session,
                version: version ?? '0.0.0',
                code: code,
                links: {
                    self: request.originalUrl,
                    worker: href
                }
            }));
        }
    })

}

export default routes;