import fp from "fastify-plugin";
import * as Y from "yjs";
import YProvider from "y-partykit/provider";
import {env} from "node:process";
import {type FastifyBaseLogger} from "fastify";
import {HocuspocusProvider, HocuspocusProviderWebsocket} from "@hocuspocus/provider";
import ws from "ws";

 

const defaults= {yjsUrl: env.YJS_URL! || "ws://0.0.0.0:1234" , room:"main" , doc: new Y.Doc({guid: "main", collectionid: "agents", gc: false, autoLoad: true})};


type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> | FastifyBaseLogger;
export class YjsDocManager {
    providers = new Map<string, HocuspocusProvider>();

    constructor(private yjsUrl: string, private log:Logger = console) {
        console.log("Yjs docs manager created", yjsUrl);

    }

    create(id: string, doc: Y.Doc |undefined = undefined,connect:boolean=false):  HocuspocusProvider {

        doc = doc || new Y.Doc({guid: id});
        
        const provider= new HocuspocusProvider( {
            url: this.yjsUrl,
            name: id,
            document: doc,
            
            websocketProvider:new HocuspocusProviderWebsocket({
                url: this.yjsUrl,
                WebSocketPolyfill: ws,
                 
            }),
            connect:connect
        });

        this.log.debug(`Yjs main provider created: ${this.yjsUrl}\t room: '${id}'\t doc: '${provider.document.guid}'\t connected: '${provider.isConnected}'`);

        provider.on("wsconnected", () => {
            this.log.info(`Connected!: ${this.yjsUrl}\t room: ${id}\t doc: ${provider.document.guid}\t synced: ${provider.synced}`);
        })
 
        provider.document.load()

        return provider;
    }

    getOrCreate(id: string, doc:Y.Doc |undefined =  undefined,  connect:boolean=true) {
        if (!this.providers.has(id)) {
            this.providers.set(id, this.create(id, doc,connect));

        }
        return this.providers.get(id)!.document

    }

    get(id: string) {
        return this.providers.get(id)?.document
    }
}

export const yjsPartyProviderPlugin = fp(async (fastify, options: { doc?: Y.Doc; yjsUrl?: string }) => {
    const {doc, yjsUrl} = {...defaults, ...(options || {})}

    fastify.decorate("docs", new YjsDocManager(yjsUrl, fastify.log));

    fastify.decorate("doc", {
        getter() {
            return fastify.docs.getOrCreate(doc?.guid, doc)
        }
    });

    fastify.decorate("yjsUrl", yjsUrl);

});


export default yjsPartyProviderPlugin;
