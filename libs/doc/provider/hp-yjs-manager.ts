 import * as Y from "https://esm.sh/yjs@^13.6.20?target=esnext";
 import {
    HocuspocusProvider,
    type HocuspocusProviderConfiguration,
    HocuspocusProviderWebsocket,
  } from "https://esm.sh/@hocuspocus/provider@2.15.0?&external=ws&target=esnext";

  import type {FastifyBaseLogger} from "https://esm.sh/fastify?target=esnext";

 export type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> | FastifyBaseLogger;
 
 export type ConnectOptions<T = Record<string | number | symbol, never>> = {
     doc: Y.Doc | string,
     connect: true
 } & T;
  
 

const defaults= {yjsUrl:  "ws://0.0.0.0:1234" , room:"main" , doc: new Y.Doc({guid: "main", collectionid: "agents", gc: false, autoLoad: true})};



type HPConnectOptions = Omit<ConnectOptions<HocuspocusProviderConfiguration>, "url" | "name"> & Partial<HocuspocusProviderConfiguration>;
export class HPYjsDocManager {
    providers = new Map<ConnectOptions["doc"], HocuspocusProvider>();

    constructor(private yjsUrl: string=defaults.yjsUrl, private log:Logger = console) {
        console.log("Yjs docs manager created", yjsUrl);

    }

    create({ doc, connect, ...options}: ConnectOptions<HPConnectOptions>):  HocuspocusProvider {
        
        const provider= new HocuspocusProvider( {
            preserveConnection: false,
            broadcast: false,
            url: this.yjsUrl,
            document: typeof doc === "string" ? new Y.Doc({guid: doc}) : doc,
            websocketProvider:new HocuspocusProviderWebsocket({
                url: this.yjsUrl,
                WebSocketPolyfill: WebSocket,

            }),
            forceSyncInterval:false,
            name: typeof doc === "string" ? doc : doc?.guid || "default",
            ...options,
            connect:connect
        });

        this.log.debug(`Yjs main provider created: ${this.yjsUrl}\t   doc: '${provider.document.guid}'\t connected: '${provider.isConnected}'`);

        provider.on("wsconnected", () => {
            this.log.info(`Connected!: ${this.yjsUrl}\t doc: '${provider.document.guid}'\t synced: '${provider.synced}'`);
        })
        provider.document.load()


        return provider;
    }

    connect(options: ConnectOptions<HPConnectOptions> | string) {
        const id = typeof options === "string" ? options : options.doc?.guid;
        if (!this.providers.has(id)) {
            this.providers.set(id, this.create(typeof options === "string" ? {doc: options} : options)); 
        }
        return this.providers.get(id)!.document

    }

    get(id: ConnectOptions["doc"]) {
        return this.providers.get(id)?.document
    }
}
