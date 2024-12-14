import YProvider from "https://esm.sh/y-partykit/provider";
 import * as Y from "yjs";
export class YjsDocManager {
    providers = new Map<string, YProvider>();
   
    constructor(private yjsUrl: string = Deno.env.get("yjs_url") ||  "ws://localhost:1999", private log:Pick<Console, "log" | "debug" | "trace" | "info"> = console) {
        console.log("Yjs docs manager created", yjsUrl);
 
    }

    create( id: string, connect:boolean=false): YProvider {

        const provider= new YProvider(this.yjsUrl, id, undefined,{
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

    getOrCreate(id: string, connect:boolean=true) {
        if (!this.providers.has(id)) {
            this.providers.set(id, this.create(id, connect));

        }
        return this.providers.get(id)!.doc

    }

    get(id: string) {
        return this.providers.get(id)?.doc
    }
}
