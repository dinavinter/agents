import * as Y from "https://esm.sh/yjs";
import {parseArgs} from "jsr:@std/cli/parse-args";
import {type AnyActorLogic, createActor, waitFor} from "xstate";
import {YjsDocManager} from "./provider/hp.ts";
import {serviceMachine} from "./inspect/inspector.ts";
import {fromAIEventStream, fromAIElementStream,asyncBatchEvents,asyncEventGenerator} from "https://esm.sh/@cxai/stream";
import {azure} from "https://esm.sh/@ai-sdk/azure";
import {createHash} from "node:crypto";
import { Buffer } from "node:buffer";
import { newDenoHTTPWorker } from "deno-http-worker";

const flags = parseArgs(Deno.args, {
  string: ["url" , "room", "collection", "doc", "src", "port"],
});
export function revisionHash(src: string): string  {
    return revisionHash(Buffer.from(src))

    function revisionHash(data: Uint8Array): string {
        return createHash('md5').update(data).digest('hex').slice(0, 10);
    }

}

console.log(flags, Deno.args)
const room = flags.room || Deno.env.get("ID") || "app";

function getRevDoc(rev: string, src: string) {
    const revDoc = new Y.Doc({guid: `${room}:${rev}`, meta: {rev, agent: room, path: `/agents/${room}/${rev}`}});
    if(revDoc.getMap().get("rev") !== rev) {
        revDoc.transact(() => {
            revDoc.getMap().set("src", src);
            revDoc.getMap().set("rev", rev);
            revDoc.getMap().set("status", "idle")
        })
    }
    return revDoc;
}

async function tryStart(docManager: YjsDocManager, agentDoc: Y.Doc, revDoc: Y.Doc) {
    if(revDoc.getMap().get("src") ) {
     
    console.log("starting rev", revDoc.getMap().get("rev"))
    
    try {
        const actor = await start(revDoc);
        actor.start();
        console.log("started", revDoc.guid) 
        docManager.getOrCreate(revDoc.guid, revDoc);
        
        const rev = revDoc.getMap<string>().get("rev")!;
        agentDoc.transact(() => {
            agentDoc.getMap("revisions").set(rev,  "running");
            agentDoc.getMap().set("rev", rev)
        });
        revDoc.getMap().set("status", "running")
        await waitFor(actor, () => false).then(() => {
            console.log('done')
            revDoc.getMap().set("status", "done")
            agentDoc.getMap("revisions").set(rev, "done")
        })
    } catch (error) {
        console.error(error)
        revDoc.getMap().set("status", "error")
        revDoc.destroy()
    }
    }
}

if (import.meta.main) {
    const docManager = new YjsDocManager(flags.url); 
    const doc  =docManager.getOrCreate(room);
    const agents = docManager.getOrCreate(":agents");
    // const revDoc = getRevDoc(doc.getMap().get("rev") || revisionHash(doc.getMap().get("codemirror") || ""), doc.getMap().get("codemirror"));
    // await tryStart(docManager, doc, revDoc);
    doc.getText("codemirror").observe(async (event) => {
        const src = event.target.toJSON();
        const rev = revisionHash(src);
        console.log("change", rev)

        const revDoc = getRevDoc(rev, src);
        await tryStart(docManager, doc, revDoc); 
        agents.transact(() => {
            // agents.getMap().set(id, {
            //     rev: agent.getMap().get("rev"),
            //     timestamp: agent.getMap().get("timestamp")
            // })
            agents.getMap(room).set("rev", revDoc.getMap().get("rev"))
            agents.getMap(room).set("timestamp",  revDoc.getMap().get("timestamp"))
            agents.getMap(room).set("status", "running")
        });

    })
}


async function start(doc:Y.Doc ) {
    doc.shouldLoad && doc.load();
    const state = doc.getMap("current").get("state");
    const context = doc.getMap("current").get("context");
    // console.log("state", state, context)
    
    const logic = await getMachine(doc.getMap<string>().get("src")!);
    return createYjsActor(logic);

    function createYjsActor(logic: AnyActorLogic) { 
        return createActor(serviceMachine, {
            id: 'service',
            input: {
                logic: logic,
                doc: doc 
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
                stream:asyncEventGenerator,
                batch:  asyncBatchEvents,
                apiWorker: async ({ input }) => {
                    if (!input?.code) return undefined;
                    try {
                        const worker = await newDenoHTTPWorker(input.code, {
                            printOutput: true,
                            runFlags: ["--allow-net"],
                            port: parseInt(env.DENO_HTTP_WORKER_PORT || "8000")
                        });
                        return worker;
                    } catch (error) {
                        console.error("Failed to create API worker:", error);
                        return undefined;
                    }
                },
                aiElementStream: fromAIElementStream({
                    model: azure('gpt-4o',{
                        // baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
                        // fetch: sapAIFetch,
                    }),  
                    temperature: 0.9
                }),
                aiStream: fromAIEventStream({
                    model: azure('gpt-4o',{
                        // baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
                        // fetch: sapAIFetch, 
                    }),
                    temperature: 0.9,
                     
                    
                })
            }
        });
    }


}
