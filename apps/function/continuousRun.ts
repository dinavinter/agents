import {Buffer} from "node:buffer";
import {createHash} from "node:crypto";
import { connectYjs } from "https://esm.town/v/dinavinter/connect";
import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";
import { Temporal } from "https://esm.sh/@js-temporal/polyfill";

export function continuousRun(ydoc: Y.Doc | string) {
    const doc = typeof ydoc === "string" ? connectYjs(ydoc) : ydoc;
    const agent = doc.guid;
    const agents = new Y.Doc({guid: ":agents"})
    connectYjs(agents);

    const revisions = new Map<string, Y.Doc>();

    function getRevDoc(rev: string, src: string) {
        if (!revisions.has(rev)) {
            const revDoc = new Y.Doc({guid: `${agent}:${rev}`, meta: {rev, agent, path: `/agents/${agent}/${rev}`}});
            revDoc.transact(() => {
                revDoc.getMap().set("src", src);
                revDoc.getMap().set("rev", rev);
                revDoc.getMap().set("timestamp", Date.now());
                revDoc.getMap().set("status", "idle")
            })
            revisions.set(rev, revDoc);
        }
        return revisions.get(rev)!;
    }


    function revisionHash(src: string): string {
        return revisionHash(Buffer.from(src))

        function revisionHash(data: Uint8Array): string {
            return createHash('md5').update(data).digest('hex').slice(0, 10);
        }

    }


    async function tryStart(doc: Y.Doc) {
        const src = doc.getMap<string>().get("src");

        if (src) {
            try {
                console.log("src", src)
                const {default: module} = await import(`data:text/javascript,${src}`);
                const {val, fetch} = module;
                console.log("val from rev observe", val, fetch)
                return {val, fetch, status: "running"};
            } catch (error) {
                console.error(error)
                return {error, status: "error"};
            }
        }
        return {error: "no src"}
    }

    let handler: Deno.ServeHandler<Deno.NetAddr> | undefined;
    doc.getMap().observe(async (event) => {
        console.log("doc changed", event.keysChanged)
        const meta = doc.getMap<string>();
        if (event.keysChanged.has("src") && meta.get("src")) {
            const src = meta.get("src")!
            const rev = meta.get("rev") || revisionHash(src);
            const revDoc = getRevDoc(rev, src);
            if (revDoc.getMap().get("status") === "idle") {
                revDoc.getMap().set("status", "starting")
                const {val, fetch, error, status} = await tryStart(revDoc);
                if (fetch) {
                    handler = fetch;
                }
                doc.transact(() => {
                    doc.getMap(rev).set("status", status)
                    doc.getMap(rev).set("val", val)
                    doc.getMap(rev).set("error",error && {
                        message: "message" in error ? error.message : error,
                        stack: "stack" in error ? error.stack : undefined,
                        name: "name" in error ? error.name : undefined,
                        time: Temporal.Now.instant().toString(),
                    })
                    doc.getMap("revisions").set(rev, status);
                })
            }
        }
    })
    return {
        doc,
        agent,
        revisions,
        agents,
        getHandler(){
            return handler;
        }
    }
}
 