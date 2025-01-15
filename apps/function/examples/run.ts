import * as Y from "https://esm.sh/yjs";
import {parseArgs} from "jsr:@std/cli/parse-args";
import {createActor, SnapshotFrom, waitFor} from "xstate";
import {AnyActorLogic} from "xstate";
import {YjsDocManager} from "../provider/hp.ts";
import {serviceMachine} from "../inspect/inspector.ts";
import {createYjsHub,fromAIEventStream} from "https://esm.sh/@cxai/stream";
import {azure} from "https://esm.sh/@ai-sdk/azure";

import {baseUrl, sapAIFetch} from "https://esm.sh/sap-ai-token";
import {fromAIElementStream, openaiGP4o} from "../../agent/ai/index.ts";
 
const flags = parseArgs(Deno.args, {
  string: ["url" , "room", "collection", "doc", "src", ],
});
flags.room="i_24"
console.log(flags, Deno.args)
const src = flags.src ||  "./examples/withinput.ts"
const room = flags.room || src.split("/").pop()?.split(".")[0] || src;
// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
   const docManager = new YjsDocManager(flags.url); 
    const doc  =docManager.getOrCreate(room);
    
    const actor=await start(doc); 
    actor.start();
    await waitFor(actor, () =>  false).then(() => {
        console.log('done')
    })
}


async function start(doc:Y.Doc ) {
    doc.shouldLoad && doc.load();
    const state = doc.getMap("current").get("state");
    const context = doc.getMap("current").get("context");
    console.log("state", state, context)
    
    const logic = await getMachine(doc.getMap<string>().get("src")!);
    return createYjsActor(logic);

    function createYjsActor(logic: AnyActorLogic) {
        const hub =  createYjsHub(doc);
        const snapshotMap = hub.doc.getMap('state')?.toJSON() as SnapshotFrom<typeof logic>;
        
      
        return createActor(serviceMachine, {
            id: 'service',
            input: {
                logic: logic,
                hub: hub,
                snapshot:  snapshotMap.status ? snapshotMap : undefined, 

            },
            
            inspect: {
                next: (e: { type: string; }) => {
                    // e.type === '@xstate.event' && console.log("inspect", e)
                }
            }
        })
      
    }

   
    async function getMachine(code:string) {
        // code= code || example;
        const tempFilePath = await Deno.makeTempFile();
        await Deno.writeTextFile(tempFilePath, code);

        const env= Deno.env.toObject();
        const module = await import(tempFilePath);

        return module.default.provide({
            actors: {
                aiElementStream: fromAIElementStream({
                    model: openaiGP4o(),
                    temperature: 0.9
                }),
                aiStream: fromAIEventStream({
                    model: azure('gpt-4o',{
                        baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
                        fetch: sapAIFetch,

                    }),
                    temperature: 0.9
                })
            }
        });
    }


}

