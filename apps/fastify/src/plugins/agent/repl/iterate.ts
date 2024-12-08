import * as Y from "yjs";
import './yjs.type'
import fp from "fastify-plugin";
import './agent'
import {Agent} from "fastify";
 


export const vmIterator= fp(async function (fastify) {
   fastify["agent.extensions"].push( async function (agent: Agent) {
      return {
          vm: iterateMap(agent.getMap<Y.Doc>("vm"))
      }
});


 


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




export default vmIterator;


