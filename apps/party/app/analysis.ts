import type {StoreElement, StoreLoaded} from "./store";

export  class AnalysisElement extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `<h1>Analysis</h1>`;
    }
    
    onConnectedCallback() {
        const store = document.querySelector('y-store') as StoreElement;
        store.addEventListener("store", e => this.load(e as StoreLoaded));
      
    }
 
    private load({detail:{doc}}: StoreLoaded) {
        console.log("analysis:connected", doc);
        doc.getArray("analysis").forEach((analysis) => {
            console.log("analysis", analysis);
            this.innerHTML += `<pre prettytext class="pretty-text">${JSON.stringify(analysis, null,2)}</pre>`;
        }) 
    }
}

customElements.define('c-analysis', AnalysisElement);