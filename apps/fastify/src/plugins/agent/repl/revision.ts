import fp from "fastify-plugin";
import * as Y from "yjs";
import {createHash} from "node:crypto";
import {t, YTMap} from "../yjs.type";
import '../agent'
import {Properties} from "../agent";

type VMCollectionId<TAgent extends string> = `${TAgent}/vm`; 

export type Meta = {
    type: string,
    name: string,
    latest: string,
    src: string
}


 declare module "fastify" {
    interface Agent {
        src: YTMap<Code>, 
        latest(): VMDoc ,
        revision(rev?: string): VMDoc,
        rev: string
    }

     interface VMDoc extends Y.Doc {
         properties: YTMap<Code & {href:string}>
        
    }
}



 
 
export type Code ={
      rev: string;
      timestamp: number;
      src: string;
}



function vmDoc(agent: Y.Doc) {
    const source = t<Code>(agent.getMap());
    const code = source.toJSON();
    const {rev, timestamp, src} = code;
    const collectionid = `${agent.guid}/vm`;
    const doc = new Y.Doc({
        guid: rev,
        collectionid: collectionid,
        meta: {
            rev: rev,
            timestamp: timestamp
        }
    });
    doc.getMap().set("src", src);
    doc.getMap().set("rev", rev);
    doc.getMap().set("timestamp", timestamp);
    return doc;
}
 
function syncRev(code:  YTMap<Properties>):YTMap<Properties> & {
    rev(): string,
    sync:()=>{
      unobserve:()=>void
    }} { 
    
    function revision(code:  YTMap<Properties>) {
        return revisionHash(code.get("src") || code.set("src", `createMachine({
              id: ${code.doc?.guid}
        })`));
    }
    
    function updateRev(rev:string) {
        if(code.get("rev") !== rev) {
            code.set("rev", rev);
            code.set("timestamp", Date.now());
        }
        return rev;
    }
    function revisionHash(src: string): string  {
        return revisionHash(Buffer.from(src))

        function revisionHash(data: Uint8Array): string {
            return createHash('md5').update(data).digest('hex').slice(0, 10);
        }

    }

    updateRev(revision(code));
    
    
    return Object.assign(code,{
        rev(){
            return code.get("rev") ??  code.set("rev", revision(code)) 
        }, 
        sync(){ 
            function callback(e: Y.YMapEvent<any>) {
                if (e.keysChanged.has("src")) {
                    code.set("rev", revision(code));
                    code.set("timestamp", Date.now());
                }
            }
            code.observe(callback);
            return {
                unobserve: () => code.unobserve(callback)
            }
        }
    });
}

export const sourceManagementPlugin = fp( async (fastify) => {
    fastify["agent.extensions"].push( function (agent) {
        const vmMap = agent.getMap<Y.Doc>("vm");
        const code = syncRev(agent.properties);
        code.sync();
        const revisionDoc=(rev: string) => {
            const doc= vmMap.get(rev) || vmMap.set(rev, vmDoc(agent))
            return Object.assign(doc, {
                properties:t<Code & {href:string}>(doc.getMap())
            });
        }
        return {
            src: code,
            get rev( ) {return code.rev()}, 
            latest(){
                return revisionDoc(code.rev())
            },
            revision: revisionDoc
        }
    });
});



export default sourceManagementPlugin;
