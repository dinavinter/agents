import {c, css, html} from "atomico"; 



export const Snapshot = c(function ({ context, value, status,tags }) {
    return html`
        <host shadowDom>
            <div >
                <pre>${status}</pre>
                <h2>context: </h2> <pre prettytext>${context && JSON.stringify(context, null, 2)}</pre>
                <h2 >state: </h2><pre prettytext>${value && JSON.stringify(value, null, 2)}</pre>
                <h2 >tags: </h2><pre>${tags && JSON.stringify(tags, null, 2)}</pre>
            </div> 
            <slot name="${value}"></slot>
        </host>`
},{
    props: {
        context: {
            type: Object,
            reflect: true
        },
        value: {
            type: String,
            reflect: true
        },
        status: {
            type: String,
            reflect: true
        },
        tags: {
            type: Object,
            reflect: true
        }
    },
    styles: css`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        @tailwind screens;
        `
        
});
customElements.define('c-snapshot', Snapshot);