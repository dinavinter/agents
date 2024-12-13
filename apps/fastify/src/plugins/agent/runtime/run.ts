import fp from "fastify-plugin";
import {syncVmMachines} from "./sync";
import * as Y from "yjs";
import {ActorVm, createVM} from "../../../routes/createVM";
import {t} from "../yjs.type";
import type {Code} from "../repl/revision";
import {createYjsHub} from "../../../stream/hub";

declare module "fastify" {
    interface VMI{
        start: ()=>Promise<ActorVm>,
        stop: ()=>Promise<void>
    }
    interface FastifyInstance {
        vm(docId: Y.Doc | string): VMI
    }
    
  
    interface Agent {
        start: VMI["start"],
        stop: VMI["stop"],
    }
    interface VMDoc extends Y.Doc {
        start:VMI["start"],
        stop:VMI["stop"]
    }
        
}

async function getOrCreate<TKey, TValue>(map:Map<TKey, TValue>, key:TKey, create:()=>PromiseLike<TValue>){
    if(!map.has(key)){
        map.set(key, await create())
    }
    return map.get(key)!;
}
export const agentRunnerPlugin = fp(async (fastify) => {
    const observers = new Map<string, ActorVm>();
    const discovery = fastify.docs.getOrCreate(":discovery");
 
    fastify.decorate("vm",  function (docId:Y.Doc | string) {
        const id = typeof docId === "string" ? docId : docId.guid
        const doc = docId instanceof Y.Doc ? docId : fastify.docs.getOrCreate(id);
        return {
            start() {
                return getOrCreate(observers, id, async function () {
                    const vm = await createVM(t<Code>(doc.getMap()).get("src"), createYjsHub(doc));

                    discovery.getMap().set(id, {
                        href: vm.href,
                        rev: vm.hub.doc.getMap().get("rev"),
                        timestamp: Date.UTC(Date.now())
                    });

                    return vm;
                })
            },
            async stop() {
                const vm = observers.get(id);
                if(vm) {
                    await vm?.server?.close();
                    discovery.getMap().delete(id);
                    observers.delete(id);
                }
            }
        }
    })
    
    
    fastify["agent.extensions"].push( function (agent) {
          
        const createSnapshot = agent.createSnapshot.bind(agent);
        const revision = agent.revision.bind(agent);
        
        return {

            start: async function () {
                const snapshot = agent.createSnapshot();
                return fastify.vm(snapshot).start()
            },
            stop: async function () {
                const discovery = agent.getMap("discovery");
                for (const [key,] of discovery) {
                    await fastify.vm(key).stop()
                }
            },
            createSnapshot: async function () {
                const snapshot = createSnapshot();
                return Object.assign(snapshot, fastify.vm(snapshot))
            },
            revision: function (rev: string) {
                const snapshot = revision(rev);
                return snapshot && Object.assign(snapshot, fastify.vm(snapshot))
            }
        }
                
    })

});


export default agentRunnerPlugin;