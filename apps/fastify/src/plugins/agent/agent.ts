import fp from "fastify-plugin";
import * as Y from "yjs"; 
import './yjs.type'
import {FastifyInstance, AgentFactory, Agent} from "fastify";
import './collection'
import {t, YTMap} from "./yjs.type";
import {Code} from "./source";

export type Properties ={
    rev: string;
    timestamp: number;
    src: string;
    href?: string;
}

declare module "fastify" { 
    
    interface FastifyInstance   {
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

    type plugin = (agent: Agent )=> any;

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
    meta: {
        type: "agent";
    } & TMeta 
} & {
    [Property in keyof T]: T[Property];
}





async function  agentCreatorPlugin<TFastifyInstance extends FastifyInstance>(fastify:TFastifyInstance) {
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
    
     
    
    
    fastify.decorate("agent",function  (id, meta) {
        const doc = fastify.agents.get(id) || fastify.agents.set(id, new Y.Doc({
            guid: id,
            collectionid: "agents",
            gc: false,
            autoLoad: true,
            meta: {
                type: 'agent',
                name: id,
                ...meta
            }
        }))

        return  fastify["agent.extensions"].reduce(((acc, e) => {
            return Object.assign(acc, e(acc))
        }), doc as Agent)

     } );
    
    fastify.decorate("agent.fromDoc", function (doc:Y.Doc) {
        return fastify["agent.extensions"].reduce(((acc, e) => {
            return Object.assign(acc, e(acc))
        }), doc as Agent)
    });
}

export default fp(agentCreatorPlugin);
