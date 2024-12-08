import fp from "fastify-plugin";
import * as Y from "yjs";
import {Agent} from "fastify";


export const autoSyncAgentsVm= fp(async function (fastify,  {doc}: {doc:Y.Doc}) {
    const agentMap = new Map<string, ReturnType<Agent["sync"]>>();

    doc.on("subdocs", async ({added, removed, loaded}) => {
        for (const agent of Array.from(new Set<Y.Doc>([...loaded, ...added]))) {
            agentMap.set(agent.guid, fastify["agent.fromDoc"](agent).sync());
        }
        for (const agent of Array.from(removed)) {
            agentMap.get(agent.guid)?.unsubscribe();
            agentMap.delete(agent?.guid);
        }
    });

})

export default autoSyncAgentsVm;