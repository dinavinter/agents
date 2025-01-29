import * as Y from "https://esm.sh/yjs";
import {parseArgs} from "jsr:@std/cli/parse-args";
import {waitFor} from "xstate";
import {HPYjsDocManager as YjsDocManager} from "https://crux.land/6Ex5Yb";
import {createHash} from "node:crypto";
import { Buffer } from "node:buffer";
 import {mod} from "./imort.ts";
 import {createYjsActor} from "https://crux.land/4TzRc8";
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
async function start(doc: Y.Doc) {
    doc.shouldLoad && doc.load();
    const module = await mod(doc.getMap<string>().get("src")!);

    return createYjsActor(module.default,doc);
 
}

async function tryStart(docManager: YjsDocManager, agentDoc: Y.Doc, revDoc: Y.Doc) {
    if(revDoc.getMap().get("src") ) {
     
    console.log("starting rev", revDoc.getMap().get("rev"))
    
    try {
        const actor = await start(revDoc);
        actor.start();
        console.log("started", revDoc.guid) 
        docManager.connect({doc: revDoc});
        
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
        
    }


  
}
}

if (import.meta.main) {
    const docManager = new YjsDocManager(flags.url); 
    const doc  =docManager.connect(room);
    const agents = docManager.connect(":agents");
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



