import * as Y from "yjs";
import YProvider from "y-partykit/provider";

const storeLoadedEvent = (details:{
    doc:Y.Doc;
    provider:YProvider;
} ) => new CustomEvent("store", {
    bubbles: true,
    composed: true,
    detail: details
});

export type StoreLoaded = ReturnType<typeof storeLoadedEvent>;
export class StoreElement extends HTMLElement {

    doc:Y.Doc;
    provider: YProvider;

    static observedAttributes = ["url", "room"];

    get url() {
        return this.getAttribute("url") || document.location.host;
    }
    get room() {
        return this.getAttribute("room") || "catalog";
    }

    get guid() {
        return this.getAttribute("guid") || "catalog";
    }
    constructor() {
        super();
        const {provider, doc} =this.connect();
        this.doc = doc ;
        this.provider = provider;
        console.log("store:constructor ",this.url, this.room, "\tconnected:", this.provider.wsconnected , "\tdoc:loaded", this.doc.isLoaded, "\tdoc:synced", this.doc.isSynced);

    }

    connectedCallback() {
        console.log("store:connected", this.url, this.room, "\tconnected:", this.provider.wsconnected , "\tdoc:loaded", this.doc.isLoaded, "\tdoc:synced", this.doc.isSynced);
        this.provider.on("wsconnected", () => {
            console.log("store:wsconnected", this.url, this.room, "\tconnected:", this.provider.wsconnected , "\tdoc:loaded", this.doc.isLoaded, "\tdoc:synced", this.doc.isSynced);
            this.provider.doc.load();
        })
        this.provider.connect();

        this.dispatchEvent(storeLoadedEvent({doc: this.doc, provider: this.provider}));
    }


    attributeChangedCallback(name:string, oldValue:any, newValue:any) {
        console.log(
            `Attribute ${name} has changed from ${oldValue} to ${newValue}.`,
        );
        if(name === "room" || name === "url" && oldValue !== newValue) {
            const {provider, doc} =this.connect();
            this.doc = doc;
            this.provider = provider;
        }
    }



    private connect() {
     
        const provider = new YProvider(this.url, this.room, new Y.Doc({guid:"catalog"}), {
            connect: true,
            disableBc: true, 
        });
        const doc = provider.doc;
        console.log("connect ",provider.url, provider.roomname, "\tconnected:", provider.wsconnected , "\tdoc:loaded", doc.isLoaded, "\tdoc:synced", doc.isSynced);

        
        return {provider: provider, doc: doc};
    }
}

customElements.define("y-store", StoreElement);

declare global {
    interface HTMLElementTagNameMap {
        "y-store": StoreElement;
    }
}