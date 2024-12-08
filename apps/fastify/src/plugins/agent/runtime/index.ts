import * as Y from "yjs";
import fp from "fastify-plugin"; 

declare module "fastify" { 
    interface Agent{
        sync: ()=> {
            unsubscribe: ()=>void
        }
    }
}

 
export type AgentRuntimePluginOptions = {
    auto?: {doc:Y.Doc}
} 


export const agentRunnerPlugin = fp<AgentRuntimePluginOptions>(async (fastify, options:AgentRuntimePluginOptions ) => {
    fastify.register(import('./sync'));
    if(options.auto){
        fastify.register(import('./auto'), options.auto)
    }
    
 });


export default agentRunnerPlugin;