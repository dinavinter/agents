import * as Y from "yjs";
import {type VNodeAny} from "https://esm.sh/atomico/types/vnode";
/*
const example={
    "type": "main",
    "props": {
        "class": "mx-auto  bg-slate-50 h-full"
    },
    "children": [
        {
            "type": "header",
            "props": {
                "title": "The Wiser"
            },
            "children": [],
            "raw": false
        },
        {
            "type": "div",
            "props": {
                "class": "flex flex-col items-center justify-center *:w-1/2 *:justify-center",
                "hx-ext": "sse",
                "sse-swap": "content",
                "hx-swap": "beforeend"
            },
            "children": [],
            "raw": false
        }
    ],
    "raw": false
}

=> Y.XmlFragment <main class="mx-auto  bg-slate-50 h-full" > <header title="The Wiser" > </header> <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="content" hx-swap="beforeend" > </div> </main>
*/
 export  function toFragment(node:VNodeAny) {

     const target = new Y.XmlElement(node.type);
     for (const [key, value] of Object.entries(node.props)) {
         target.setAttribute(key, value?.toString() ?? "");

     }
     target.insert(0, node.children.map(toFragment)); 
     return target;

 }



export async function * toFragmentAsync(events:AsyncIterable<VNodeAny[]>) {
    for await (const event of events) {
        for (const node of event) {
             yield toFragment(node); 
        }
    }
}