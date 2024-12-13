// import fp from "fastify-plugin";
// import * as Y from "yjs";
// import {FastifyInstance} from "fastify";
//
//
// declare module "fastify" { 
//     interface FastifyInstance { 
//         agents :AgentCollection
//     }
// }
//
// export type AgentCollection = ReturnType<(typeof agents)>
//
//
// export function agentsSource(fastify:FastifyInstance ) {
//     return fastify.agents ?? new Y.Doc({
//         guid: "agents",
//         collectionid: "agents",
//         gc: false,
//         autoLoad: true
//     }).getMap("agents") as AgentCollection;
// }
//
// 
// export function agents (map:Y.Map<Y.Doc>) {
//     return Object.assign(Object.assign(map, map.doc), {
//          list: Array.from(map, (([id, agentDoc]) => ({
//             id,
//             meta: agentDoc.meta,
//             vm: agentDoc.getMap("vm").toJSON(),
//         })))
//     });
// }
//     
//
// export const agentListPlugin = fp(async (fastify, options: { doc: Y.Doc }) => {
//     const { doc } = options;  
//     fastify.decorate("agents", agents(doc.getMap<Y.Doc>('agents')));
// });
//
// export default agentListPlugin;
