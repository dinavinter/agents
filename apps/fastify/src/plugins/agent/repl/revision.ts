import fp from "fastify-plugin";
import * as Y from "yjs";
import {createHash} from "node:crypto";
import {t, YTMap} from "../yjs.type";
import '../agent'
import {Properties} from "../agent";
import {VM} from "./auto";
 
 
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



  
function syncRev(code:  YTMap<Properties>):YTMap<Properties> & {
    rev(): string,
    sync:()=>{
      unobserve:()=>void
    }} { 
    
    function revision(code:  YTMap<Properties>) {
        return revisionHash(code.get("src") || "");
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
            const doc = fastify.docs.getOrCreate(id );
            //     ,function () {
            //     const doc = new Y.Doc({
            //         guid: id,
            //         collectionid: "vm",
            //         meta: {
            //             type: "vm",
            //             agent: agent.guid,
            //         }
            //     })
            //     doc.getMap().set("src", src);
            //     doc.getMap().set("rev", rev);
            //     doc.getMap().set("timestamp", timestamp);
            //     return doc;
            // });
            doc.getMap().set("src", src);
            doc.getMap().set("rev", rev);
            doc.getMap().set("timestamp", timestamp);

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
           
        }
        
        return {
            latest() {
                const latest = agent.getMap<Revision>("revisions").get(agent.rev);
                return latest && fastify.docs.getOrCreate(latest.id)
            },
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
