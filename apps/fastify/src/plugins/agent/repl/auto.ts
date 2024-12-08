import * as Y from "yjs";
import {Code} from "./revision";
import {t} from "../yjs.type";
import fp from "fastify-plugin";
import '../agent'
import {Agent} from "fastify";

export type VM= {
    rev:string,
    timestamp:number,
    href:string,
    version:string,
    id:string,
    session:string
}



export const autoVmToLatestCodePlugin= fp(async function (fastify, {doc}: {doc:Y.Doc}) {

    function syncSrcToVm(agent: Agent) {
        const source = t<Code>(agent.getMap());
        let latest= undefined as ReturnType<typeof agent["revision"]> | undefined;
        function callback(e: Y.YMapEvent<any>) {
        

            if (e.keysChanged.has("rev")) {
                latest = agent.revision(source.get("rev"));
            }
        }

        source.observe(callback);
        return {
            get latest(){
                return latest
            },
            unsubscribe: () => source.unobserve(callback)
        }
    }

    const agentMap= new Map<string, ReturnType<typeof syncSrcToVm>>;

    doc.on("subdocs", async ({added, removed, loaded}) => {
        for (const agent of Array.from(new Set<Y.Doc>([...loaded, ...added]))) {
            agentMap.set(agent.guid, syncSrcToVm(fastify["agent.fromDoc"](agent)));
        }
        for (const agent of Array.from(removed)) {
            agentMap.get(agent.guid)?.unsubscribe();
            agentMap.delete(agent?.guid);
        }
    });
});
 


 /*
        function callback(e: Y.YMapEvent<any>) {
           function hrefUpdateCallback(e:Y.YMapEvent<any>) {
                agent.getMap().set("href", e.target.get("href"));
            }
            
    

            if (e.keysChanged.has("rev")) {
                latest = agent.revision(source.get("rev"));
                 latest.getMap().observe(hrefUpdateCallback)
               prev?.getMap().unobserve(hrefUpdateCallback)
            }
        }

     

  */


function iterateMap<T extends  Y.Doc>(map: Y.Map<T>, sort: (a: any, b: any) => number= (a, b) => a - b) {
    function vms() {
        return Array.from(map.values()).sort(sort);
    }

    return Object.assign(map, {
        sorted() {
            return vms();
        },
        [Symbol.iterator]() {
            return map.values()
        },
        [Symbol.asyncIterator]: async function* () {
            let next: { latest: T, previous?: T } | undefined = undefined;
            while (true) {
                next = await iterateAsync(next?.latest);
                yield  next;
            }
        }
    });

    function iterateAsync(latest?: T): Promise<{ latest: T, previous?: T }> {
        return new Promise((resolve) => {
            const newVm = vms().pop();
            if (newVm && sort(newVm, latest) > 0) {
                resolve({latest: newVm, previous: latest});
            } else {
                function callback() {
                    const newVm = vms().pop();
                    if (newVm && sort(newVm, latest) > 0) {
                        map.unobserve(callback);
                        resolve({latest: newVm, previous: latest});
                    }
                }

                map.observe(callback);
            }
        });
    }
}

 


export default autoVmToLatestCodePlugin;


