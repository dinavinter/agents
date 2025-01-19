import {FastifyPluginAsyncJsonSchemaToTs, JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type {Agent, FastifyInstance, FastifyPluginAsync} from "fastify";
import * as Y from "yjs";
import '../plugins/agent/runtime'
import '../plugins/agent/repl'
import {revisionHash} from "@/plugins/agent/repl/revision.ts";

function updateAgentSrc(docs: FastifyInstance["docs"], id: string, code: string) {
    const agent = docs.getOrCreate(id);
    
    const rev = revisionHash(code);
    agent.transact(() => {
        if (agent.getMap().get("rev") !== rev) {
            agent.getMap().set("src", code);
            agent.getMap().set("rev", revisionHash(code));
            agent.getMap().set("timestamp", Date.now());
        }
    });
    
    const agents = docs.getOrCreate(":agents");

    agents.transact(() => {
        // agents.getMap().set(id, {
        //     rev: agent.getMap().get("rev"),
        //     timestamp: agent.getMap().get("timestamp")
        // })
        agents.getMap(id).set("rev", agent.getMap().get("rev"))
        agents.getMap(id).set("timestamp", agent.getMap().get("timestamp"))
    });
    console.log(`Updated agent ${JSON.stringify(agents.getMap(id).toJSON())} `)
    return agent;
}

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

    const example2=`import {createMachine, assign, emit} from "xstate";


export default createMachine({
    id: 'machine',
    initial: 'stage1', 
    context:{
        index: 0
    },
    states: {
        stage1: {
            entry: assign({
                index: ({context: {index}}: { context: { index: number } }) => index + 1
            }),
            always: {
                target: 'stage2',
                guard: ({context: {index}}: { context: { index: number } }) => index > 10
            }, 
            after: {
                1000: {
                    target: 'stage1',
                    reenter: true,
                    actions: emit(({context: {index}}: { context: { index: number } }) => ({
                        type: 'EMIT',
                        data: index,
                        event: 'stage-1'
                    }))
                },
                

            },
        },
        stage2:{
            entry: assign({
                index: ({context: {index}}: { context: { index: number } }) => index + 1
            }),
            after: {
                10000: {
                    target: 'stage2',
                    reenter: true,
                    actions: emit(({context: {index}}: {context:{index:number}}) => ({
                        type: 'EMIT',
                        data: index,
                        event: 'stage-2'
                    }))
                }
            },
        }
    }
})

 


 
`
 
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
            const agents = fastify.docs.getOrCreate(":agents");

            agents.shouldLoad && agents.load();
            console.log(`Agents ${agents.guid} ${agents.isLoaded} ${agents.isSynced} ${agents.shouldLoad} `, Array.from(agents.share.keys()))
            const json= Array.from(agents.share.keys()).filter(id=> id !== "").reduce((acc, id) => ({
                ...acc,
                [id]: {
                    id,
                    ...agents.getMap(id).toJSON()
                }
            }), {} as Record<string, any>)
            console.log(`Agents ${JSON.stringify(json)}`)
            reply.type('application/json');
            return reply.send(JSON.stringify(json, null, 2));
            
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
                        examples: [example, example2]
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
           const agent= updateAgentSrc(fastify.docs, id, code);


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
                        examples: [example2,example]
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
            const agent= updateAgentSrc(fastify.docs, id, code);

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
            const agent = fastify.docs.getOrCreate(id);
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

            const agent= fastify["agent.fromDoc"](fastify.docs.getOrCreate(id)); 
            console.log(`Starting agent ${id} ${agent.getMap().get("rev")}  ${agent.getMap().get("src")}`)
            const {href}=  await fastify.vm(agent.createSnapshot()).start();
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
            const agent= fastify["agent.fromDoc"](fastify.docs.getOrCreate(id)); 
            const vmDoc= agent.createSnapshot()
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
        url: '/agents/:agent/:rev',
        method: 'get',
        handler(request, reply) {
            const {agent, rev} = request.params as {  rev: string ; agent :string};
            const id= `${agent}:${rev}` 
            const workflow = fastify.docs.getOrCreate(id);
            workflow.load()
            reply.type('application/json');
            return reply.send(vmJson(workflow));
        }
    })


    fastify.route({
        url: '/docs/:doc',
        method: 'get',
        handler(request, reply) {
            const {doc} = request.params as { doc: string };
            const docInstance = fastify.docs.getOrCreate(doc);
            reply.type('application/json');
            return agentJson(docInstance);
            // return reply.send(JSON.stringify({
            //     id: docInstance.guid,
            //     collection: docInstance.collectionid,
            //     loaded: docInstance.isLoaded,
            //     synced: docInstance.isSynced ,
            //     should_load: docInstance.shouldLoad,
            //     meta: docInstance.meta,
            //     ...Array.from(docInstance.share.entries()).reduce((acc, [key, value]) => {
            //         acc[key] = value.toJSON();
            //         return acc
            //     }, {} as Record<string, any>)
            // }));
        }
    })





    function agentJson( agent:Y.Doc  ) {
        // const vm=agent.latest();
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
            // latest: vm && {
            //     id: vm.guid,
            //     ...vm.meta,
            //     rev: vm.getMap().get("rev"),
            //     timestamp: vm.getMap().get("timestamp"),
            //     src: vm.getMap().get("src"),
            //     href: vm.getMap().get("href")
            // },
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
