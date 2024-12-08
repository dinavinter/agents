import * as Y from "yjs";
import fp from "fastify-plugin";

export type AgentRuntimePluginOptions = {
    auto?: {doc:Y.Doc}
}


export const agentRunnerPlugin = fp<AgentRuntimePluginOptions>(async (fastify, options:AgentRuntimePluginOptions ) => {
    fastify.register(import('./revision'));
    // fastify.register(import('./iterate'));

    if(options.auto){
        fastify.register(import('./auto'), options.auto)
    }

});

export default agentRunnerPlugin;