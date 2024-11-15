import {ActorRefFrom, AnyActorRef, AnyStateMachine, createActor, createMachine, emit, EventObject} from "xstate";
import {serviceMachine} from "agent/inspect/inspector";
import {FastifyPluginAsyncJsonSchemaToTs} from "@fastify/type-provider-json-schema-to-ts";
import {yArrayIterator} from "agent/stream/yjs";
import * as Y from "yjs";
import {EventMessage} from "fastify-sse-v2";
import {randomFill, randomInt, randomUUID} from "node:crypto";
import fp from "fastify-plugin";
import { vm} from "../routes/vm";
import {createHash} from "node:crypto";
import {createYjsHub} from "agent/stream/hub";

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

async function vmAsync(codeArray: Y.Array<{code:string, rev:string, timestamp:number}>,  versionMap: Y.Map<any>):Promise<{
    code:string,
    rev:string,
    timestamp:number,
    href:string,
    version:string,
    id:string,
    session:string
}> {

    return codeArray.length ? await getVm(codeArray.get(codeArray.length - 1), codeArray.length - 1 ) : await new Promise<ReturnType<typeof getVm>>(function (resolve) {
        codeArray.observe(callback);

        function callback() {
            if (codeArray.length) {
                resolve(getVm(codeArray.get(codeArray.length - 1)))
            }
        }
    } )
    async function getVm({code,rev}:{code:string, rev:string}, index: number) {
        if (!versionMap.get(rev)) {
            const {href, hub} = await vm(code,
                createYjsHub(versionMap.set(rev,
                    new Y.Doc({
                        meta: {
                            type: 'version',
                            code,
                            rev,
                            timestamp: Date.now(),
                            version: index.toString() 
                        },
                        collectionid: "versions",
                        guid: rev 
                    }))));

            hub.doc.getMap("meta").set("href", href);
            


            // versionMap.doc?.subdocs.add(hub.doc);


        }
        
        const version = versionMap.get(rev);

        return { 
            ...version.meta,
            ...version.getMap("meta").toJSON()
        }
    }

}
export class Code {
    public rev: string;
    public timestamp: number;
    
    constructor(public code: string) {
        this.rev = revisionHash(Buffer.from(code));
        this.timestamp = Date.now();
    }
}

const store: AgentStore = (doc) => {

    doc = doc ?? new Y.Doc({});
    
    
    function agent(this:{doc}, agent: string) {

        const {doc} = this;
        const agents = doc.getMap('agents');
        const agentDoc = agents.get(agent) || agents.set(agent, createAgentDoc());
        const config = agentDoc.getMap('config');
 
        const store = {
            doc: agentDoc,
            logic: atomLogic(config),
            config: config
        }

        return {
            logic: store.logic,
            vm: vmAsync.bind(null, agentDoc.getArray("src"), agentDoc.getMap("versions")),
            configure: configure.bind(store),
            worker: worker.bind(store),
            src: agentDoc.getArray<{ code: string, rev: string, timestamp: number }>("src"),
           


        }
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

      

    
    
    return agent.bind({doc})
}



function revisionHash(data:  Uint8Array): string { 
    

    return createHash('md5').update(data).digest('hex').slice(0, 10);
}


 export type XstateWorkerPluginOptions = {
     doc?: Y.Doc 
 }

export const xstateWorkerPlugin: FastifyPluginAsyncJsonSchemaToTs<XstateWorkerPluginOptions> = async function (instance, {doc}) {
     
    instance.decorate('agent', store(doc));
    
}
    
export default fp(xstateWorkerPlugin);