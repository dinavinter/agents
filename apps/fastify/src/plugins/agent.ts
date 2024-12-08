import {FastifyPluginAsyncJsonSchemaToTs} from "@fastify/type-provider-json-schema-to-ts";
import * as Y from "yjs";
import fp from "fastify-plugin";
import {ActorVm, createVM} from "../routes/createVM";
import {createHash} from "node:crypto";
import {createYjsHub} from "agent/stream/hub";
import {HocuspocusProvider} from "@hocuspocus/provider";
 import {env} from "node:process";
import {WebsocketProvider} from "y-websocket";
import YProvider from "y-partykit/provider";
import ws from "ws";


declare module "fastify" {
    
    interface FastifyInstance {
         agent: (id: string)=> ReturnType<(typeof agent)> 
         agents:()=> ReturnType<(typeof agents)>
    } 
}



export type VM= {
    code:string,
    rev:string,
    timestamp:number,
    href:string,
    version:string,
    id:string,
    session:string
}

export class Code {
    public rev: string;
    public timestamp: number;

    constructor(public code: string) {
        this.rev = this.revisionHash(Buffer.from(code));
        this.timestamp = Date.now();
    }

    revisionHash(data: Uint8Array): string {
        return createHash('md5').update(data).digest('hex').slice(0, 10);
    }
}



export type AgentPluginOptions = {
    doc?: Y.Doc
}




function agent(this:{doc:Y.Doc}, agent: string) { 
    const {doc} = this;
    
    const agents = doc.getMap('agents') as Y.Map<Y.Doc>;
    const agentDoc = agents.get(agent) || agents.set(agent, new Y.Doc({
        guid: agent,
        collectionid: "agents",
        gc: false, 
        autoLoad: true,
        meta: {
            type: 'agent',
            id: agent,
            name: agent 
        } 
    })) as Y.Doc;
    
   
    
   
    return {
        doc:agentDoc,
        vm: vmAsync.bind(null, agentDoc.getMap("vm")),
        src: agentDoc.getArray<{ code: string, rev: string, timestamp: number }>("src") 
    }
}

async function vmAsync(vm: Y.Map<any>):Promise<VM> {
    if (vm.get("href")) {
        return vm.toJSON() as VM;
    }
    return new Promise((resolve, reject) => {
        function callback(e: Y.YMapEvent<any>) {
            const {href, ...more} = e.target.toJSON() as VM;
            if (href) {
                resolve({href, ...more});
                vm.unobserve(callback);
            }
        }

        vm.observe(callback);

    })

}

function agents(this:{doc:Y.Doc}) {
    const {doc} = this;
    return Array.from(doc.getMap<Y.Doc>('agents')).map(([id, agentDoc]) => {
        return {
            // versions: Array.from(agentDoc.getMap<Y.Doc>("versions")).map(([id, versionDoc]) => ({
            //     id,
            //     ...versionDoc.meta,
            //     ...versionDoc.getMap("meta").toJSON()
            // })) || [],     
            id,
            ...agentDoc.meta,
            ...agentDoc.getMap("vm").toJSON() 
        }
    })
}


function syncDocs(doc1: Y.Doc, doc2: Y.Doc) {
    doc1.on('update', update => {
        // console.debug('doc1.on:update', update)
        const stateVector2 = Y.encodeStateVector(doc2)
        const diff = Y.encodeStateAsUpdate(doc1, stateVector2)
        Y.applyUpdate(doc2, diff)

        // Y.applyUpdate(doc2, update)
    })

    doc2.on('update', update => {
        // console.debug('doc2.on:update', update)
        const stateVector1 = Y.encodeStateVector(doc1)
        const diff = Y.encodeStateAsUpdate(doc2, stateVector1)
        Y.applyUpdate(doc1, diff)
    })
    
}



export const agentPlugin: FastifyPluginAsyncJsonSchemaToTs<AgentPluginOptions> = async function (instance, {doc}) {
 
    const providerMap = new Map<string, YProvider>();
    function getProvider(doc: Y.Doc) {
        if (!providerMap.has(doc.guid)) {
            const provider = new YProvider(env.YJS_URL! || "ws://localhost:1999", doc.guid, new Y.Doc({
                guid: doc.guid,
                collectionid: doc.collectionid,
                autoLoad: true
            }), {
                connect: true,
                // disable broadcast channel for this demo, so syncing only happens via the partykit server
                // https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API
                disableBc: true,
                WebSocketPolyfill:ws,
            })
            syncDocs(doc, provider.doc);
            
            providerMap.set(doc.guid, provider);
        }
        return providerMap.get(doc.guid);
    }
    // const provider = new HocuspocusProvider({
    //     url: env.YJS_URL!,
    //     name: 'agents', 
    //     preserveConnection: true,
    //     document: doc ?? new Y.Doc({
    //         guid: 'agents',
    //         collectionid: 'store',
    //         autoLoad: true
    //     })
    // })
    // var provider = new WebsocketProvider(env.YJS_URL || "ws://localhost:1999", 'agents' , doc ?? new Y.Doc({
    //     guid: 'agents',
    //     collectionid: 'store',
    //     autoLoad: true,
    // }));

    const provider =new YProvider(env.YJS_URL! || "ws://localhost:1999", 'agents', doc, {
        connect: true,
        // disable broadcast channel for this demo, so syncing only happens via the partykit server
        // https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API
        disableBc: true,
        WebSocketPolyfill:ws,
        
     })
    provider.connect();
    instance.log.info(`agent plugin connected: ${provider.wsconnected}  connecting: ${provider.wsconnecting} synced: ${provider.synced}`);    
    const serverMap = new Map<string, ActorVm["server"]>();
    
    provider.doc.on('subdocs', ({loaded,added, removed}) => {
        console.log("agents", {loaded, added, removed});
        for (const agentDoc of [...loaded, ...added]) {
            getProvider(agentDoc);
                
            
            agentDoc.getMap("vm").observe(async (e:Y.YMapEvent<any>) => {
                const {rev, timestamp, code}= e.target.toJSON()
                console.log("vm", rev, timestamp, code);
                if (!serverMap.has(rev)) { 
                    const {href, server} = await createVM(code, createYjsHub( agentDoc));
                    serverMap.set(rev, server);
                    console.log("href", href);
                    e.target.set("href", href);
                    agentDoc.getMap("meta").set("href", href);
                } 
            })
            agentDoc.getArray<Code>("src").observe( (e:Y.YArrayEvent<Code>) => {
                const vmMap = agentDoc.getMap("vm");
                // const srcArray = agentDoc.getArray("src");
                agentDoc.transact(() => {
                    const {rev, timestamp, code}= agentDoc.getArray("src").toJSON().pop();
                    if(vmMap.get("rev") !== rev) {
                        vmMap.set("rev", rev);
                        vmMap.set("timestamp", timestamp);
                        vmMap.set("code", code);
                    }
                }) 
            })
        }
        
        
        
      
    })
    
    instance.decorate("agents", agents.bind({
        doc:provider.doc
    }));

    instance.decorate('agent', agent.bind({
        doc:provider.doc
    }));


}
    
export default fp(agentPlugin);
 