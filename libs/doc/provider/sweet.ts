//@ts-nocheck
import * as Y from "https:esm.sh/yjs@13.6.20";
import {createYjsProvider, type YSweetProvider, type YSweetProviderParams } from "https://esm.sh/@y-sweet/client@0.6.4";
import { DocumentManager } from "https://esm.sh/@y-sweet/sdk@0.6.4";
import type {ConnectOptions,YjsDocManager} from "./type.ts";




export class SweetYjsDocManager implements YjsDocManager<YSweetProviderParams> {
    public  docManager:DocumentManager ;
    private providers = new Map<ConnectOptions["doc"], YSweetProvider>();

    constructor(private yjsUrl: string = Deno.env.get("yjs_url") ||  "ws://localhost:1999", private log:Pick<Console, "log" | "debug" | "trace" | "info"> = console) {
        console.log("Yjs docs manager created", yjsUrl);
        this.docManager=new DocumentManager(yjsUrl);
       
    }

    create( { doc, connect, ...options}: ConnectOptions<YSweetProviderParams>): YSweetProvider {

      const document=  typeof doc ==="string"? new Y.Doc({guid:doc, gc: false, autoLoad: true}) : doc ||new Y.Doc({ gc: false, autoLoad: true})

        const provider= createYjsProvider(document, document.guid || "default", "http://localhost:3002/api/auth", {
            // @ts-ignore the sweet types don't play nice with deno
            disableBc: true,
            WebSocketPolyfill: WebSocket,
           ...options,
           connect:false
       });


        // @ts-ignore the sweet types don't play nice with deno 
        this.log.debug(`Yjs main provider created: ${this.yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t connected: ${provider.wsconnected}`);

        // @ts-ignore the sweet types don't play nice with deno
        provider.on("wsconnected", () => {
            // @ts-ignore the sweet types don't play nice with deno
            this.log.info(`Connected!: ${this.yjsUrl}\t room: ${provider.roomname}\t doc: ${provider.doc.guid}\t synced: ${provider.synced}`);
        })

        if(connect) {
            provider.connect();
        }

        return provider;
    }

     connect( options: ConnectOptions<YSweetProviderParams>): Y.Doc {
         if (!this.providers.has(options.doc)) {
            this.providers.set(options.doc, this.create(options));

        }
        return this.providers.get(options.doc)!.doc

    }

    get(id: string) {
        return this.providers.get(id)?.doc
    }
}
