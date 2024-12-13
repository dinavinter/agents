import fp from "fastify-plugin";
import * as Y from "yjs";
import YProvider from "y-partykit/provider";
import WebSocket from "ws";
import {env} from "node:process";
import {type FastifyBaseLogger} from "fastify";
 
declare module "fastify"{
    interface FastifyInstance {
        doc: Y.Doc , 
        docs: YjsDocManager
    }
}

const defaults= {yjsUrl: env.YJS_URL! || "ws://localhost:1999" , room:"main" , doc: new Y.Doc({guid: "main", collectionid: "agents", gc: false, autoLoad: true})};


type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> | FastifyBaseLogger;
export class YjsDocManager {
    providers = new Map<string, YProvider>();

    constructor(private yjsUrl: string, private log:Logger = console) {
        console.log("Yjs docs manager created", yjsUrl);

    }

    create(id: string, createDoc:(id:string)=>Y.Doc |undefined = ()=>undefined,connect:boolean=false):  YProvider {

        const provider= new YProvider(this.yjsUrl, id, createDoc(id),{
            disableBc: true,
            // @ts-ignore
            WebSocketPolyfill: WebSocket,
            connect:false
        });

        this.log.debug(`Yjs main provider created: ${this.yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}`);

        provider.on("wsconnected", () => {
            this.log.info(`Connected!: ${this.yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t synced: ${provider.synced}`);
        })

        if(connect) {
            provider.connect();
        }

        return provider;
    }

    getOrCreate(id: string, createDoc:(id:string)=>Y.Doc |undefined = ()=>undefined,  connect:boolean=true) {
        if (!this.providers.has(id)) {
            this.providers.set(id, this.create(id, createDoc,connect));

        }
        return this.providers.get(id)!.doc

    }

    get(id: string) {
        return this.providers.get(id)?.doc
    }
}

export const yjsPartyProviderPlugin = fp(async (fastify, options: { doc?: Y.Doc; yjsUrl?: string }) => {
    const {doc, yjsUrl} = {...defaults, ...(options || {})} 
    
    fastify.decorate("docs", new YjsDocManager(yjsUrl, fastify.log));

    fastify.decorate("doc", {
        getter() {
            return fastify.docs.getOrCreate(doc?.guid, ()=>doc)
        }
    });
    
    fastify.decorate("yjsUrl", yjsUrl);

});


export default yjsPartyProviderPlugin;
