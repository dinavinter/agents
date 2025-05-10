import * as Y from "yjs";
import { connect } from "./connect";
import * as awarenessProtocol from "y-protocols/awareness";

const storeLoadedEvent = (details:{
    doc:Y.Doc;
    awareness: awarenessProtocol.Awareness;
    url?:string;
    room:string;
} ) => new CustomEvent("store", {
    bubbles: true,
    composed: true,
    detail: details
});


declare global {
    interface CustomEventMap {
        "store": StoreLoaded
    }
}

export type StoreLoaded = ReturnType<typeof storeLoadedEvent>;

export class Stores extends HTMLElement {
    stores: Map<string, StoreLoaded["detail"]> = new Map();

    constructor() {
        super();
        this.addEventListener("store", (e: StoreLoaded) => {
            console.log("store", e.detail);
            this.stores.set(`${e.detail.url}:${e.detail.room}`, e.detail);
        });
 

        this.attachShadow({mode: "open"});
        this.shadowRoot!.innerHTML = `
         <slot></slot>
        `;
     
    }

   
    
    
}

customElements.define("y-stores", Stores);

export function useStore(url:string, room:string) {
   const stores = document.querySelector("y-stores") as Stores;
   const store = stores.stores.get(`${url}:${room}`);
   if(!store) {
    throw new Error("Store not found");
   }
   return store;
}


export class StoreElement extends HTMLElement {

    public doc:Y.Doc;
    public awareness: awarenessProtocol.Awareness;

    static observedAttributes = ["url", "room"];

    get url() {
        return this.getAttribute("url") || undefined ;
    }
    get room() {
        return this.getAttribute("room") || "def";
    }
    
    constructor() {
        super();
        const {awareness, document} =connect(this.url, this.room);
        
        this.doc = document ;
        this.awareness = awareness;

    }

    connectedCallback() {
        this.dispatchEvent(storeLoadedEvent({doc: this.doc, awareness: this.awareness, url: this.url, room: this.room}));
    }


    // attributeChangedCallback(name:string, oldValue:any, newValue:any) {
    //     console.log(
    //         `Attribute ${name} has changed from ${oldValue} to ${newValue}.`,
    //     );
    //     if(name === "room" || name === "url" && oldValue !== newValue) { 
    //         const {awareness, document} =connect(this.url, this.room);
    //         this.doc = document;
    //         this.awareness = awareness;
    //         this.dispatchEvent(storeLoadedEvent({doc: this.doc, awareness: this.awareness, url: this.url, room: this.room}));

    //     }
    // }



 
}

customElements.define("y-store", StoreElement);

declare global {
    interface HTMLElementTagNameMap {
        "y-store": StoreElement;
    }
}