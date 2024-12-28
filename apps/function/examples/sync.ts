import * as Y from "https://esm.sh/yjs";
import {parseArgs} from "jsr:@std/cli/parse-args";
import {createActor, SnapshotFrom, waitFor} from "xstate";
import {AnyActorLogic} from "xstate";
import {YjsDocManager} from "../provider/hp.ts";
import {serviceMachine} from "../inspect/inspector.ts";
import {createYjsHub,fromAIEventStream} from "https://esm.sh/@cxai/stream";
import {azure} from "https://esm.sh/@ai-sdk/azure";

import {baseUrl, sapAIFetch} from "https://esm.sh/sap-ai-token";
import {createHash} from "node:crypto";
import { Buffer } from "node:buffer";
 
const flags = parseArgs(Deno.args, {
  string: ["url" , "room", "collection", "doc", "src", ],
});
export function revisionHash(src: string): string  {
    return revisionHash(Buffer.from(src))

    function revisionHash(data: Uint8Array): string {
        return createHash('md5').update(data).digest('hex').slice(0, 10);
    }

}

console.log(flags, Deno.args)
const room = flags.room || Deno.env.get("ID") || "i_24";
if (import.meta.main) {
    const docManager = new YjsDocManager(flags.url); 
    const doc  =docManager.getOrCreate(room);
    
    doc.getText().observe(async (event) => {
        const src = event.target.toJSON();
        const rev = revisionHash(src);
        const revDoc=  docManager.getOrCreate(`${room}:${rev}`,  new Y.Doc({guid: `${room}:${rev}`, meta: {rev}}));
        revDoc.transact(()=> {
            revDoc.getMap().set("src", src);
            revDoc.getMap().set("rev", rev);
            revDoc.getMap().set("status", "idle")
        })
        const actor = await start(revDoc);
         doc.getMap("current").set("rev", rev)
        actor.start();
        revDoc.getMap().set("status", "running")
        
        await waitFor(actor, () => false).then(() => {
            console.log('done')
            revDoc.getMap().set("status", "done")

        })
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

