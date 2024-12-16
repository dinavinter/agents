import {FastifyPluginAsyncJsonSchemaToTs, JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type {Agent, FastifyInstance, FastifyPluginAsync} from "fastify";
import * as Y from "yjs";
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
        url: '/agents',
        method: 'GET',
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
                agents: Array.from(fastify.agents).map(([key, agent])=>({
                    id: key,
                    ...agent, 
                    links: {
                        self: `${request.originalUrl}/${key}`,
                        workers: `${request.originalUrl}/${key}/workers`
                    }
                }))
            });
        }
    })
    
    fastify.route({
        url: '/agents',
        method: 'post',
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
            return reply.send(agentJson(agent)); 
        }
    })
    
    fastify.route({
        url: '/agents/:agent',
        method: 'post',
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
            return reply.send(agentJson(agent));
        }
    })

    fastify.route({
        url: '/agents/:agent',
        method: 'get',
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
            // const vm=agent.vm;
            reply.type('application/json');
            return reply.send(agentJson(agent));
        }
    }) 

    fastify.route({
        url: '/agents/:agent/start', method: 'post',
        schema: {
            summary: 'Start Agent',
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
           
            const {href}=  await fastify.vm(fastify.agent(id).createSnapshot()).start();
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
        url: '/agents/:agent/latest',
        method: 'get',
        handler(request, reply) {
            const {agent:id}= request.params as { agent: string };
            const vmDoc= fastify.agent(id).latest()
            if(!vmDoc) {
                reply.status(404);
                return reply.send({error: 'Not Found'})
            }
            vmDoc.load()
            reply.type('application/json');
            return reply.send(vmJson(vmDoc));
        }
    }) 

    fastify.route({
        url: '/agents/:agent/:vm',
        method: 'get',
        handler(request, reply) {
            const {agent:id, vm}= request.params as { agent: string, vm: string };
            const agent= fastify.agent(id);
            const vmDoc= agent.revision(vm);
            vmDoc.load()
            reply.type('application/json');
            return reply.send(vmJson(vmDoc));
        }
    })
    
    
    fastify.route({
        url: '/docs/:doc',
        method: 'get',
        handler(request, reply) {
            const {doc} = request.params as { doc: string };
            const docInstance = fastify.docs.getOrCreate(doc);
            docInstance.load()
            reply.type('application/json');
            return reply.send(JSON.stringify({
                id: docInstance.guid,
                collection: docInstance.collectionid,
                loaded: docInstance.isLoaded,
                synced: docInstance.isSynced ,
                should_load: docInstance.shouldLoad,
                meta: docInstance.meta,
                ...Array.from(docInstance.share.entries()).reduce((acc, [key, value]) => {
                acc[key] = value.toJSON();
                return acc
            }, {} as Record<string, any>)
            }));
        }
    })
        



    function agentJson( agent:Agent  ) {
        const vm=agent.latest();
        agent.shouldLoad && agent.load();
        return JSON.stringify({
            id: agent.guid,
            debug: fastify.debug,
            href: agent.getMap().get("href"),
            rev: agent.getMap().get("rev"),
            doc: {
                id: agent.guid,
                collection: agent.collectionid,
                loaded: agent.isLoaded,
                synced: agent.isSynced ,
                should_load: agent.shouldLoad,
            },
            
            meta: agent.meta,
            src: agent.getMap().get("src"),
            latest: vm && {
                id: vm.guid,
                ...vm.meta,
                rev: vm.getMap().get("rev"),
                timestamp: vm.getMap().get("timestamp"),
                src: vm.getMap().get("src"),
                href: vm.getMap().get("href")
            },
            subdocs: Array.from(agent.subdocs).map(({guid, collectionid, meta}) => ({guid, collectionid, meta})),
            // doc: fastify.doc.guid,
            // room: fastify.room, 
            links: {
                self: '/',
                worker: agent.getMap().get("href")
            }
        });
    }
    function vmJson(vmDoc: Y.Doc) {
        return JSON.stringify({
            id: vmDoc.guid,
            collection: vmDoc.collectionid,
            loaded: vmDoc.isLoaded,
            synced: vmDoc.isSynced ,
            should_load: vmDoc.shouldLoad,
            meta: vmDoc.meta,
            rev: vmDoc.getMap().get("rev"),
            timestamp: vmDoc.getMap().get("timestamp"),
            src: vmDoc.getMap().get("src"),
            href: vmDoc.getMap().get("href"),
            json: vmDoc.toJSON(),
            ...vmDoc.meta
        });
    }


}

export default routes;
