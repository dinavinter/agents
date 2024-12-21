//@ts-nocheck
import YProvider, {type YPartyKitProviderOptions} from "https://esm.sh/y-partykit/provider";
import type {ConnectOptions, Logger, YjsDocManager} from "./type.ts";
 
export class PartyYjsDocManager implements YjsDocManager<YPartyKitProviderOptions> {
    providers = new Map<ConnectOptions["doc"], YProvider>();
   
    constructor(private yjsUrl: string = Deno.env.get("yjs_url") ||  "ws://localhost:1999", private log:Logger = console) {
        console.log("Yjs docs manager created", yjsUrl);
 
    }

    create({ doc, connect, ...options}: ConnectOptions<YPartyKitProviderOptions>):  YProvider {
        const room = typeof options.doc === "string" ? options.doc : options.doc?.guid || "default";

        const provider= new YProvider(this.yjsUrl, room, doc,{
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

    connect(options: ConnectOptions<YPartyKitProviderOptions>) {
        if (!this.providers.has(options.doc)) {
            this.providers.set(options.doc, this.create(options));

        }
        return this.providers.get(options.doc)!.doc

    }

    get(id: ConnectOptions["doc"]) {
        return this.providers.get(id)?.doc
    }
}  
