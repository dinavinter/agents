 import * as Y from "yjs";
 import {HocuspocusProvider, HocuspocusProviderWebsocket} from "https://esm.sh/@hocuspocus/provider";
 
 

const defaults= {yjsUrl: Deno.env.get("YJS_URL") || "ws://0.0.0.0:1234" , room:"main" , doc: new Y.Doc({guid: "main", collectionid: "agents", gc: false, autoLoad: true})};


type Logger = Pick<Console, "log" | "debug" | "trace" | "info"> ;
export class YjsDocManager {
    providers = new Map<string, HocuspocusProvider>();

    constructor(private yjsUrl: string=defaults.yjsUrl, private log:Logger = console) {
        console.log("Yjs docs manager created", yjsUrl);

    }

    create(id: string, doc: Y.Doc |undefined = undefined,connect:boolean=false):  HocuspocusProvider {

        doc = doc || new Y.Doc({guid: id});

        const provider= new HocuspocusProvider( {
            url: this.yjsUrl,
            name: id,
            document: doc,
            preserveConnection: true,
            broadcast: false,
            websocketProvider:new HocuspocusProviderWebsocket({
                url: this.yjsUrl,
                WebSocketPolyfill: WebSocket,
                
            }),
            connect:connect
        });

        this.log.debug(`Yjs main provider created: ${this.yjsUrl}\t room: '${id}'\t doc: '${provider.document.guid}'\t connected: '${provider.isConnected}'`);

        provider.on("wsconnected", () => {
            this.log.info(`Connected!: ${this.yjsUrl}\t room: '${id}'\t doc: '${provider.document.guid}'\t synced: '${provider.synced}'`);
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
