import * as Y from 'yjs';
import {YEvent} from "yjs";
import {yArrayIterator, yMapIterate} from "./array.ts";
import {transformAsyncIterable} from "../stream/sse.ts";
 
import {YDocStream} from "./ydoc.ts";
import {EventMessage} from "../stream/sse.ts";
import {pushable} from "it-pushable";

type SSEIterator = AsyncGenerator<EventMessage>;
type ComponentIterator = SSEIterator
 

export class YDocSse {
     private docStream: YDocStream;
 
    constructor(public base:string,public doc:Y.Doc = new Y.Doc()) {
        console.log("new doc", doc.guid);
        this.docStream = new YDocStream(this.doc );
        
      
    }
     async * subdocs(swap:string, abortSignal?:AbortSignal):SSEIterator   {   
        console.log("subdocs", this.doc.guid, swap);
         for await (const subdoc of this.docStream.subdocs(abortSignal)) {
             const path = `${swap}-${subdoc.guid}`;
             if(subdoc.action === "add") {
                 yield {
                     data: `<div id="${path}" hx-swap="beforeEnd"  hx-ext="sse" sse-connect="${this.base}/${subdoc.guid}" />`,
                     event: swap,
                 }
             }
                if(subdoc.action === "delete") {
                    yield {
                        data: ``,
                        event: path,
                    }
                }
         }
     } 
    async * docSse(): SSEIterator { 
        const p = pushable<EventMessage>({objectMode: true});
 
        for  (const [key,value] of Array.from(this.docStream.doc.share.entries()).sort(([a], [b]) => a.localeCompare(b))) { 
            // console.log("entry", key, value.toJSON()); 
    
              const iterator =this.component(key, value);
             
            (async () => {
                for await (const event of iterator) { 
                    p.push(event);
                }
            })().catch(console.error);
              
        } 

        // yield*  this.subdocs(`${this.doc.guid}:subdocs`, abortSignal)
  
       for await (const entry of p) {
           yield entry;
       }
    }

    async * component(component: string, type: Y.AbstractType<YEvent<any>>): ComponentIterator {
        const doc=this.doc;
        console.log(`***************************************${component}***************************************`);
         console.log("length", type._length);
        const abstract= doc.get(component);
        const value = abstract.toJSON();
        console.log("value", value);


        const path =    `${doc.guid}-${component === "" ? "root" : component}`;
            yield {
                data: `<div id="${path}" hx-swap="beforeend" sse-swap="${path}" hx-ext="sse"  class="snap-both  bg-gray-50 rounded-lg shadow-inner *:m-3 pt-3   scroll-smooth	focus:scroll-auto  overflow-scroll	max-h-96"/>`,
                event: `${doc.guid}`,
                id: path,
            }
        if(component && component !== "") { 
            yield {
                data: `<span class="h-6 text-blue-900 font-mono  sticky top-0">${component}:</span>`,
                event: path,
                id: `${path}:label`
            }
        }

        
        async function* toHtmxArray(stream: ReturnType<typeof yArrayIterator>): ComponentIterator {
         
            console.log("toHtmxArray", stream.raw.length);
             let i = 0;
            for await (const item of stream) {
                yield {
                    data: `<div id="${path}-${i++}" sse-swap="${path}-${i}" hx-ext="sse" >
                                ${item instanceof String ? item as string : JSON.stringify(item) }
                           </div>`,
                    event: path,
                    id: `${path}-${i}`
                }
              
            }
        }

        async function* toHtmxMap(stream: ReturnType<typeof yMapIterate>): ComponentIterator {
      
             for await (const [key, {action, newValue}] of stream) {
                const entry= `${path}-${key}`;
                if (action === "add") {
                    yield {
                        data: `<pre id="${entry}"  
                                    class="map-entry bg-gray-50 rounded-lg shadow-inner pt-2 snap-center"
                                    hx-ext="sse"
                                    hx-swap="outerHTML" 
                                    sse-swap="${entry}"
                                    contenteditable>
                                    <span class="h-6 text-blue-900 font-mono ">${key}</span>: 
                                    <pre  class="map-value prettytext m-3 overflow-auto bg-gray-100 rounded-lg shadow-inner p-3 flex-wrap break-words max-w-full text-pretty	text-wrap" 
                                          hx-ext="sse"
                                          hx-swap="innerHTML"
                                          sse-swap="${entry}:value"
                                          id="${entry}:value">
                                         <code class="flex-wrap word-wrap max-w-full scroll-auto overflow-y-scroll " contenteditable >${newValue instanceof Object ? JSON.stringify(newValue) : newValue}</code>
                                    </pre>
                               </pre>`,
                        event: path,
                        id: entry,
                    }
                }
                if (action === "update") {
                    yield {
                        data: newValue,
                        event: `${path}-${key}-value`,
                    }
                }
                if (action === "delete") {
                    yield {
                        data: ``,
                        event: `${path}-${key}`,
                        id: `${path}-${key}-delete`
                    }
                }

            }
        }


        if (type._length || value instanceof Array) {
            yield* toHtmxArray(yArrayIterator(type.doc!.getArray(component)));
        }
        else {
            yield* toHtmxMap( yMapIterate(type.doc!.getMap(component)));
        }

    }



    sse( ) {
        const stream = this.docSse.bind(this);
        const encoder = new TextEncoder();
        return new ReadableStream({
            start(controller) {
                async function pump() {
                    for await (const line of transformAsyncIterable(stream())) {
                        controller.enqueue(encoder.encode(line));
                    }
                }

                pump().then(r => console.log("done", r)).catch(e => console.error("error", e));

            }
        })
    }
}

 
 




 