import {FastifyPluginAsync} from "fastify";
import * as Y from "yjs";
import {
    AnyStateMachine,
    assign,
    createActor,
    createMachine,
    emit,
    EventObject,
    fromPromise,
    sendTo,
    StateMachine,
    StateMachineDefinition,
    Subscribable,
    toObserver
} from "xstate";
// Based on
// - https://gist.github.com/fogleman/c4a1f69f34c7e8a00da8
// - https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt from https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases
// 4547 words that are 3-5 chars and good candidates for a prefix search
import wordlist from "./wordlist.json";
import {yArrayIterator} from "../stream/yjs";
import {EventMessage} from "fastify-sse-v2";
import * as vm from "node:vm";
import {serviceMachine} from "../inspect/inspector";
import {agents, createActorInstance, services} from "../agents/agent-store";
import {render} from "../agents/agent-render";
import {yTextObservable} from "../stream/ytext";
import {machineIde} from "../agents/ide";



 


export function createStore(doc?:Y.Doc) {
    doc = doc || new Y.Doc();

    function createAgent(doc:Y.Doc) {
         return createActor(serviceMachine, {
            id: `ide/${doc.guid}`,
            input: {
                name: `${doc.guid}`,
                logic: machineIde,
                input: doc  
            }
        })
 
    }

    return {
        doc: doc,
        events: yArrayIterator(doc.getArray<EventMessage & EventObject>('events')),
        agents: doc.getMap<Y.Doc>('agents'),
        agent(id: string) { 
            if (!doc?.getMap<Y.Doc>('agents').get(id)) {
                doc?.getMap<Y.Doc>('agents').set(id, new Y.Doc({
                    guid: id,
                    meta: {
                        name: id
                    }
                }));
            }
           return createAgent( doc?.getMap<Y.Doc>('agents').get(id)!);
        }
    } 
}
  


 


export const plugin: FastifyPluginAsync = async function plugin(fastify,opts) {
    const store = createStore();

     fastify.decorateRequest('doc', '')

    fastify.get('/repl', async function handler(request, reply) {
        const id = wordlist.sort(() => Math.random() - 0.5)[0]
        return reply.redirect(`/repl/${id}`);
    })
    
    fastify.get('/repl/:id', async function handler(request, reply) {
        const {id} = request.params as { id: string };
        store.agent(id);
        if (!services.has(`ide-${id}`)) {
            services.set(`ide-${id}`, createActorInstance(`ide-${id}`, id, machineIde)); 
        }
        return reply.send({
            ide: `/agents/ide/ide-${id}`,
            preview: `/agents/${id}/latest`,
            new: `/agents/${id}`
        })
    })


}





