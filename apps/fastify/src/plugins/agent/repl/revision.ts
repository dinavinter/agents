import fp from "fastify-plugin";
import * as Y from "yjs";
import {createHash} from "node:crypto";
import {t, YTMap} from "../yjs.type";
import '../agent'
import {Properties} from "../agent";
import {VM} from "./auto";
 
type VMCollectionId<TAgent extends string> = `${TAgent}/vm`; 

export type Meta = {
    type: string,
    name: string,
    latest: string,
    src: string
}




 declare module "fastify" {
    
    interface FastifyInstance {
        vms: Y.Map<VM>
    }
 
     interface Agent {
        src: YTMap<Code>, 
        latest(): VMDoc ,
        revision(rev: string): VMDoc | undefined,
        rev: string,
        createSnapshot(): VMDoc
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
    const doc = new Y.Doc({
        guid: `${agent.guid}/${rev}`,
        collectionid: "vm",
        meta: {
            rev: rev,
            timestamp: timestamp
        },
        gc:false
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

/*
const vmId = (agent: Agent) => `${agent.guid}`;

function createSyncedDoc(doc: Y.Doc) {
    
    const newDoc = new Y.Doc({
        guid: doc.guid,
        collectionid: doc.collectionid,
        meta: doc.meta
    });
    const map= newDoc.getMap().toJSON();
    for(const key in Object.keys(map)) {
        newDoc.getMap().set(key, map[key]); 
    }
    
    return newDoc;
     
}

function syncLatest(agents:Y.Map<Y.Doc>,agent:Agent, vmMap: Y.Map<Y.Doc>) {
    vmMap.observe(()=>{ 
        const latest = Array.from(vmMap.values()).sort((a, b) => a.meta.timestamp - b.meta.timestamp).pop();
         if(latest && agents.get(vmId(agent))?.meta.rev !== latest.meta.rev) {
            agents.set(vmId(agent), createSyncedDoc(latest));
         }
    });
}

    const revisionDoc=(rev: string) => {
            if(rev === latestMap.get(vmId(agent))?.meta?.rev) {
                return latestMap.get(vmId(agent))
            }
            const doc= vmMap.get(rev) || vmMap.set(rev, vmDoc(agent))
            return Object.assign(doc, {
                properties:t<Code & {href:string}>(doc.getMap())
            });
        }

*/

export const srcPlugin = fp( async (fastify) => {
    fastify["agent.extensions"].push(function (agent, store) {
        // const vmMap = agent.getMap<Y.Doc>(`vm`);
        // const vmMap=store.getMap<Y.Doc>(agent.guid) ;
        const code = syncRev(agent.properties);
        code.sync();

        return {
            src: code,
            get rev( ) {return code.rev()}
         }
    })
})

interface Revision {
    id: string,
    rev: string,
    timestamp: number
}


export const sourceManagementPlugin = fp( async (fastify) => {
    const revisions= fastify.docs.getOrCreate(":revisions");
    fastify.decorate("vms", revisions.getMap<VM>());

    fastify.register(srcPlugin);
 
     fastify["agent.extensions"].push( function (agent) { 
        
        function createSnapshot(){
            const source = t<Code>(agent.getMap());
            const code = source.toJSON();
            const {rev, timestamp, src} = code;
            const id = `${agent.guid}:${rev}`;
            const doc = fastify.docs.getOrCreate(id, ()=>vmDoc( ));
            agent.getMap<Revision>("revisions").set(rev, {
                id,
                rev,
                timestamp
            });

            revisions.getMap<Revision>().set(id, {
                id,
                rev,
                timestamp
            });
            
            return doc;
            function vmDoc() {
                const doc = new Y.Doc({
                    guid: id,
                    collectionid: "vm",
                    meta: {
                        rev: rev,
                        timestamp: timestamp
                    },
                    gc:false
                });
                doc.getMap().set("src", src);
                doc.getMap().set("rev", rev);
                doc.getMap().set("timestamp", timestamp);
                return doc;
            }
        }
        
        return {
            latest: createSnapshot,
            createSnapshot: createSnapshot,
            revision(rev: string) {
                const revision = agent.getMap<Revision>("revisions").get(rev);
                return revision && fastify.docs.getOrCreate(revision.id)
            },
            vms: agent.getMap<Revision>("revisions")
        }
    });
     
 
         
      
      
});



export default sourceManagementPlugin;
