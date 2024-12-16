import fp from "fastify-plugin";
import * as Y from "yjs";
import './yjs.type'
import {Agent, FastifyInstance} from "fastify";
import {t, YTMap} from "./yjs.type";

export type Properties ={
    rev: string;
    timestamp: number;
    src: string;
    href?: string;
}
export type AgentProps = {
    id: string,  collection: string, meta: any
}

declare module "fastify" { 
    
    interface FastifyInstance   {
        agents: YTMap<AgentProps>
        agent: AgentFactory
        "agent.register": (plugin:plugin)=> void
        "agent.extensions": Parameters<FastifyInstance["agent.register"]>[0][]
        "agent.fromDoc": (doc:Y.Doc)=> Agent  & Ext 
    }
    
    type Ext= ReturnType<FastifyInstance["agent.extensions"][number]>

    interface Agent  extends Y.Doc  {
        guid: string;
        meta: {
            type: "agent";
        } ,
        properties:YTMap<Properties>
    } 

    type plugin = (agent: Agent , store: Y.Doc)=> any;

    interface AgentFactory  {
        <TId extends string, TMeta extends {[key:string]: any}>(id: TId, meta?: TMeta): Agent & {
            guid: typeof id;
            meta: Agent["meta"] & TMeta
        }  & Ext 
        
        fromDoc(doc:Y.Doc): Agent  & Ext
        // register<T>(key:string):T 
    }
}



export  type agent<T> = <TId extends string, TMeta extends {[key:string]: any}>(id: TId, meta?: TMeta) => Y.Doc & {
    guid: typeof id;
    collectionid: "agent";
    meta: {
        type: "agent";
    } & TMeta 
} & {
    [Property in keyof T]: T[Property];
}





async function agentCreatorPlugin<TFastifyInstance extends FastifyInstance>(fastify:TFastifyInstance) {
    fastify.decorate("agent.extensions", [
        function (agent:Agent) {
            return {
                get properties() {
                    return t<Properties >(agent.getMap()) 
                }
            }
        }
    ]);
    
    fastify.decorate("agent.register", function (ext){
         fastify["agent.extensions"].push(ext)
    })


    const agents= fastify.docs.getOrCreate(":agents");
    
   
    fastify.decorate("agents",  t<AgentProps>(agents.getMap()));
      

    fastify.decorate("agent",function  (id, meta) {
        function create() {
            return new Y.Doc({
               guid: id,
               meta: {
                   type: 'agent',
                   name: id,
                   ...meta,
                   timestamp: Date.UTC(Date.now())
               }
           });
        }

        const doc = fastify.docs.getOrCreate(id);
        agents.getMap().set(id, {
            id: doc.guid,
            meta: doc.meta,
            collection: doc.collectionid
        });
        return  fastify["agent.extensions"].reduce(((acc, e) => {
             return Object.assign(acc, e(acc, agents))
        }), doc as Agent)

     } );
    
    fastify.decorate("agent.fromDoc", function (doc:Y.Doc) {
        return fastify["agent.extensions"].reduce(((acc, e) => {
            return Object.assign(acc, e(acc, agents))
        }), doc as Agent)
    });
}

export default fp(agentCreatorPlugin);
