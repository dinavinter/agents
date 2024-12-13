import fp from "fastify-plugin";
import * as Y from "yjs";
  

export const autoSyncAgents = fp(async function (fastify ) {
    function callback({keys}: Y.YEvent<Y.Map<typeof fastify.agents>>) {
        Array.from(keys.entries()).filter(([, {action}]) => action === "add").forEach(([ , {newValue: agent}]) => {
                fastify.agent(agent.guid).start()
            }
        )
        fastify.agents.observe(callback) 
    }
    
    fastify.agents.observe(callback)
})
export const autoSyncVms= fp(async function (fastify ) { 

    fastify.vms.observe( function ({keys}) {
        for (const [key,] of Array.from(keys.entries()).filter(([, {action}]) => action === "add")) {
            fastify.vm(key).start()
        }
    })
})


export default autoSyncVms;




/*

export const autoSyncAgentsVm= fp(async function (fastify,  {doc}: {doc:Y.Doc}) {
    const agentMap = new Map<string, ReturnType<Agent["sync"]>>();

    function isAgent(doc: Y.Doc) {
        return doc.collectionid === "agent"
    }
     doc.on("subdocs", async ({added, removed, loaded}) => {
        for (const agent of Array.from(new Set<Y.Doc>([...loaded, ...added])).filter(isAgent)) {
            agentMap.set(agent.guid, fastify["agent.fromDoc"](agent).sync());
        }
        for (const agent of Array.from(removed)) {
            agentMap.get(agent.guid)?.unsubscribe();
            agentMap.delete(agent?.guid);
        }
    });

})
 */