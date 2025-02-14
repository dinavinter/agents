import * as Y from "yjs";
import {ActorVm, createVM} from "./vm.ts";
import {Agent} from "fastify"; 
import {createYjsHub} from "@cxai/stream";
import fp from "fastify-plugin";
import { t } from "../yjs.type";
import {type Code} from "../repl/revision";
 
declare module "fastify" { 
    interface Agent{
        sync: ()=> {
            unsubscribe: ()=>void
        }
    }
}


export function syncVmMachines(agent: Y.Doc) {
    const observers = new Map<Y.Doc, ActorVm>(); 
    const callback = async ({added, removed, loaded}: {added:Set<Y.Doc>,removed:Set<Y.Doc>,loaded:Set<Y.Doc>} ) => {
        function isVm(doc: Y.Doc) {
            return doc.collectionid === "vm" 
        }

        for (const vm of Array.from(new Set([...loaded, ...added])).filter(isVm)) {
            observers.set(vm, await createVM(t<Code>(vm.getMap()).get("src"), createYjsHub(vm)));
        }
        for (const vm of Array.from(removed)) {
            observers.get(vm)?.server?.close();
            observers.delete(vm)
        }
    };
    agent.on("subdocs", callback);

    return{
        unsubscribe(){
            agent.off("subdocs", callback)
        }
    }
}

export const agentRunnerPlugin = fp(async (fastify) => {
    fastify["agent.extensions"].push( function (agent) {
         return { 
            sync:syncVmMachines.bind(null, agent)
        }
    })
    
 });


export default agentRunnerPlugin;