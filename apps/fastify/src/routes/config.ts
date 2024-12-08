import {FastifyPluginAsyncJsonSchemaToTs, JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type {FastifyInstance, FastifyPluginAsync} from "fastify";

import '../plugins/agent/runtime'
import '../plugins/agent/repl'

const routes: FastifyPluginAsync = async function (instance: FastifyInstance, options) {
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
        method: 'GET',
        url: '/agents',
        schema: {
            summary: 'Get all agents',
            response: {
                200: {
                    description: 'Successful response',
                    type: 'object',
                    properties: {
                        agents: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: true,
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
                    }
                }
            }
        },
        async handler(request, reply) {
             reply.type('application/json');
            return reply.send({
                agents: fastify.agents.list.map(({id, meta, vm}) => ({
                    id: id,
                    version: meta.rev,
                    links: {
                        self: `/agents/${id}`,
                        workers: vm.href
                    }
                }))
            });
        }
    })
    
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
            const {code, id}= request.body  as {code: string, id: string}
            const agent= fastify.agent(id);
            agent.src.set("src", code);
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
                ...agent.toJSON(),
                links: {
                    self: request.originalUrl,
                    worker: agent.properties.get("href")
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
            // params:{
            //     type: 'object',
            //     properties: {
            //         agent: {type: 'string' , examples: ['emit']}
            //     }
            // },
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
            const {code}= request.body as {code: string}
            const {agent:id} = request.params as { agent: string }; 
            const agent= fastify.agent(id);
            const {src} =agent;
            src.set("src", code); 
            // console.log(`Listening at ${agent.vm.properties.get("href")}.`) 
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: agent,
                src:src.toJSON(),
                vm: agent.toJSON(),
                links: {
                    self: request.originalUrl,
                    worker: agent.properties.get("href")
                }
            }));
        }
    })
    fastify.route({
        method: 'post',
        url: '/agents/:agent/start',
        schema: {
            summary: 'Post Specific Agent Code',
            description: 'This route is to create an agent definition',
            params:{
                type: 'object',
                properties: {
                    agent: {type: 'string' , examples: ['emit']}
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
            const {agent:id} = request.params as { agent: string };
            const {href}= fastify.agent(id).vm.start();
            console.log(`Listening at ${href}.`)
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
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
                    additionalProperties: true,
                    properties: {
                        id: {type: 'string'},
                        version: {type: 'string'},
                        config: {type: 'object'},
                        definition: {type: 'object'},
                        src: {type: 'string'},
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
        async handler(this,request, reply) {
            const {agent:id} = request.params as { agent: string };
            const agent = fastify.agent(id); 
            const {src} =agent;
            
            // const vm=agent.vm;
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: id,
                // ...src.toJSON(),
                vm:agent.latest()?.properties?.toJSON(),
                // agent:agent.toJSON(),
                links: {
                    self: request.originalUrl,
                    worker: agent.properties.get("href")
                } 
            }));
            
        }
    })

}

export default routes;