import {ActorRefFrom, AnyActorRef, AnyStateMachine, createActor, createMachine, emit, EventObject} from "xstate";
import {serviceMachine} from "agent/inspect/inspector";
import {FastifyPluginAsyncJsonSchemaToTs} from "@fastify/type-provider-json-schema-to-ts";
import {yArrayIterator} from "agent/stream/yjs";
import * as Y from "yjs";
import {EventMessage} from "fastify-sse-v2";
import {randomFill, randomInt, randomUUID} from "node:crypto";
import fp from "fastify-plugin";

const services: Map<string,
    ActorRefFrom<typeof serviceMachine>
> = new Map();

 
export declare module "fastify" {
    interface FastifyInstance {
        store: ReturnType<typeof createStore>; 
        agent(agent: string): {
            worker<TLogic extends AnyStateMachine= AnyStateMachine>(worker: string): { doc: Y.Doc, logic: ActorRefFrom<TLogic>, start(input?: any): ActorRefFrom<TLogic> }
            configure<TLogic extends AnyStateMachine>(config: TLogic["config"]): TLogic
            logic:()=>  AnyStateMachine
        }


    }
}

export type AgentStore =(doc?: Y.Doc) => {
    agent: Agent,
    doc: Y.Doc
}
    

export type Agent =(agent: string) =>  {
    worker<TLogic extends AnyStateMachine= AnyStateMachine>(worker: string): { doc: Y.Doc, logic: ActorRefFrom<TLogic>, start(input?: any): ActorRefFrom<TLogic> }
    configure<TLogic extends AnyStateMachine>(config: TLogic["config"]): TLogic
}

function worker(this:{doc:Y.Doc}, worker: string) {
    const {doc:agentDoc, logic} =  this;
    worker= worker ??  randomUUID()
    const workerMap = agentDoc.getMap<Y.Doc>('workers'); 
    const workerSlug = `${agentDoc.guid}/${worker}`;
    const doc =  workerMap.get(worker) || workerMap.set(worker, createDoc());
    return {
        doc: doc,
        logic: logic(),
        start: start.bind({
            workerDoc: doc,
            logic,
            agentDoc
        })
    }
    function start(this:{ workerDoc:Y.Doc ,logic , agentDoc:Y.Doc} ,input?: any) {
        const handler = randomUUID();
        const {workerDoc, logic} = this;
        if (!services.has(workerSlug)) {
            services.set(workerSlug, createActor(serviceMachine, {
                id: `${workerDoc.guid}`,
                input: {
                    ...(input || {}),
                    name: `${agentDoc.guid}`,
                    logic: logic(),
                    doc: workerDoc
                }
            }).start())
            agentDoc.getMap("handlers").set(workerSlug, handler);
        }
        return services.get(workerSlug)!
    }

    function createDoc(): Y.Doc { 
        return  new Y.Doc({
                guid: workerSlug,
                collectionid: "workers",
                meta: {
                    type: 'worker',
                    id: worker,
                    name: agentDoc.meta?.name,
                    version: agentDoc.meta?.version,
                    logic: agentDoc.meta?.logic
                }
            }
        )
    }

}

const store: AgentStore = (doc) => {

    doc = doc ?? new Y.Doc({});
    
    
    function agent(this:{doc}, agent: string) {
        
        const {doc} = this;
        const agents = doc.getMap('agents');
        const agentDoc = agents.get(agent) || agents.set(agent, createAgentDoc());
        const config = agentDoc.getMap('config');
       
        // const machine= {
        //    get config(this:Y.Map<string>) {
        //        return JSON.parse(this.get('json') ?? "{}") as AnyStateMachine["config"];
        //    },
        //     set config(this:Y.Map<string>, config: AnyStateMachine["config"]) {
        //         return this.set('json', JSON.stringify(config));
        //     },
        //     logic: atomLogic(config)
        // }
        const store= {
            doc: agentDoc,
            logic: atomLogic(config),
            config: config
        }
        
        return {
            logic:store.logic,
            configure: configure.bind(store),
            worker: worker.bind(store)
        }
        
        function configure(this: {config: Y.Map , logic}, definition:AnyStateMachine["config"]) {
            const {config, logic} = this;
            config.set("json", JSON.stringify(definition));
            return logic();
        }
         
        function createAgentDoc( ) {
            return  new Y.Doc({
                guid: agent,
                collectionid: "agents",
                meta: {
                    type: 'agent',
                    id: agent,
                    name: agent,
                    logic: {
                        id: agent,
                        meta: {
                            name: agent,
                            version: 'draft'
                        }
                    }
                } as AnyStateMachine["config"]

            })
        }


        function atomLogic(configMap: Y.Map<any>) {
             
            function getLogic(this) {
                this.configMap.observe(callback.bind(this)); 
                function callback(this, event: Y.YMapEvent<string>) {
                    if (event.changes.keys.has('json')) {
                        const json = event.target.get('json');
                        this.logic = createMachine(JSON.parse(json));
                    }
                }
                this.logic = this.logic || createMachine(JSON.parse(configMap.get('json') ?? "{}"));
                return this.logic 
            }
                
                
            
            return getLogic.bind({configMap});
        }

    }
    
    return agent.bind({doc})
}

 export type XstateWorkerPluginOptions = {
     doc?: Y.Doc 
 }

export const xstateWorkerPlugin: FastifyPluginAsyncJsonSchemaToTs<XstateWorkerPluginOptions> = async function (instance, {doc}) {

     
    instance.decorate('agent', store(doc));
    
}
    
export default fp(xstateWorkerPlugin);