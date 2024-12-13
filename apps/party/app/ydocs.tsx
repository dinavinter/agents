import type {StoreElement, StoreLoaded} from "./store";
import * as Y from "yjs";
export  class YDocs extends HTMLElement {
    constructor() {
        super();
        console.log("y-docs:constructor");

        this.innerHTML = `<h1>docs</h1>`;

    }

    connectedCallback() {

        console.log("y-docs:connected", (document.querySelector('y-store') as StoreElement)?.doc);

        const store = document.querySelector('y-store') as StoreElement;
        // store.addEventListener("store", e => this.load(e as StoreLoaded));
        this.load({detail:{doc:store.doc}} as StoreLoaded);
    }

    private load({detail:{doc}}: StoreLoaded) {
        console.log("y-docs:load", Array.from(doc.subdocs.entries()).map(([key, value]) => value.guid));
        this.innerHTML += `<h5>${doc.guid}</h5>`;

        doc.getSubdocs().forEach((doc) => {
            this.innerHTML += `${doc.guid}`;
        })
        doc.on("subdocs", (event) => {
            console.log("subdocs", event);
            for (const d of event.added) {
                this.innerHTML += `<details>
                      <summary>${d.guid}</summary>
                     <y-doc  doc={d}></y-doc>
                </details>`
            }
        })
    }
}

customElements.define('y-doc', class YDoc extends HTMLElement {
    
    static observedAttributes = ["doc"];
    private doc: Y.Doc;
     
    setDoc(doc:Y.Doc) { 

        this.doc = doc;
        this.renderDoc();

        // Listen for document updates
        this.doc.on('update', () => this.renderDoc());
    }

    constructor() {
        super();
        console.log("y-doc:constructor");
        this.innerHTML = `<h1>doc</h1>`;
    }
    connectedCallback() {
        console.log("y-doc:connected", this.getAttribute("doc"));
         
    }


    private renderDoc() {
        
    }
});

customElements.define('y-docs', YDocs);