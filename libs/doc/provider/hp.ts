 import * as Y from "yjs";
 import {HocuspocusProvider, HocuspocusProviderWebsocket,type HocuspocusProviderConfiguration} from "https://esm.sh/@hocuspocus/provider@2.15.0?&external=ws,yjs";
 
 
 import type {ConnectOptions, YjsDocManager} from "./type.ts";
 
 

const defaults= {yjsUrl:  "ws://0.0.0.0:1234" , room:"main" , doc: new Y.Doc({guid: "main", collectionid: "agents", gc: false, autoLoad: true})};


type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> ;

type HPConnectOptions = Omit<ConnectOptions<HocuspocusProviderConfiguration>, "url" | "name"> & Partial<HocuspocusProviderConfiguration>;
export class HPYjsDocManager implements YjsDocManager<HPConnectOptions>{
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

    connect(options: ConnectOptions<HPConnectOptions>) {
        if (!this.providers.has(options.doc)) {
            this.providers.set(options.doc, this.create(options));

        }
        return this.providers.get(options.doc)!.document

    }

    get(id: ConnectOptions["doc"]) {
        return this.providers.get(id)?.document
    }
}
