import * as Y from "yjs";
 import {createYjsProvider, type YSweetProvider} from "https://esm.sh/@y-sweet/client@0.6.4";
 import { DocumentManager } from "https://esm.sh/v135/@y-sweet/sdk@0.6.4";


export class YjsDocManager {
    public  docManager:DocumentManager ;
    private providers = new Map<string, YSweetProvider>();

    constructor(private yjsUrl: string = Deno.env.get("yjs_url") ||  "ws://localhost:1999", private log:Pick<Console, "log" | "debug" | "trace" | "info"> = console) {
        console.log("Yjs docs manager created", yjsUrl);
        this.docManager=new DocumentManager(yjsUrl);
       
    }

    create( id: string = "index", connect:boolean=true): YSweetProvider {

       const provider= createYjsProvider(new Y.Doc({guid:id, gc: false, autoLoad: true}), id, "http://localhost:3002/api/auth", {
            disableBc: true,
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

    async getOrCreate(id: string, connect:boolean=true): Y.Doc {
         if (!this.providers.has(id)) {
            this.providers.set(id, this.create(id, connect));

        }
        return this.providers.get(id)!.doc

    }

    get(id: string) {
        return this.providers.get(id)?.doc
    }
}
