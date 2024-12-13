import * as Y from 'yjs';
import {YEvent} from "yjs";
import {yArrayIterator, yMapIterate} from "./stream/yjs";
import {concatAsync, flatAsync} from "./stream";
import YProvider from "y-partykit/provider";
import {transformAsyncIterable} from "./stream/sse";
// Configuration and state management
import ws from 'ws';

type SSEIterator = AsyncGenerator<{ event?: string, data: string }>;
type ComponentIterator = SSEIterator


async function* yComponentHtmx(swap: string, type: Y.AbstractType<YEvent<any>>): ComponentIterator {
    async function* toHtmxArray(name: string, stream: ReturnType<typeof yArrayIterator>): ComponentIterator {
        yield {
            data: `<div id="${name}" hx-swap="beforeEnd" sse-swap="${name}:#" />`,
            event: swap,
        }
        name = `${name}:#`;
        let i = 0;
        for await (const item of stream) {
            yield {
                data: `<div id="${name}:${i++}"    >
                                ${item}
                           </div>`,
                event: name,
            }
        }
    }

    async function* toHtmxMap(name: string, stream: ReturnType<typeof yMapIterate>): ComponentIterator {
        yield {
            data: `<div id="${name}" hx-swap="beforeEnd" sse-swap="${name}:#" />`,
            event: name,
        }
        name = `${name}:#`;
        for await (const [key, {action, newValue}] of stream) {
            if (action === "add") {
                yield {
                    data: `<div id="${name}:${key}"  
                                    class="map-entry"
                                    hx-swap="outerHTML" 
                                    sse-swap="${name}:${key}"  >
                                    <span class="map-key">${key}</span>: 
                                    <span class="map-value" 
                                          hx-swap="innerHTML"
                                          sse-swap="${name}:${key}:value"
                                          id="${name}:${key}:value">
                                         {newValue}
                                    </span>
                               </div>`,
                    event: name,
                }
            }
            if (action === "update") {
                yield {
                    data: newValue,
                    event: `${name}:${key}:value`,
                }
            }
            if (action === "delete") {
                yield {
                    data: ``,
                    event: `${name}:${key}`,
                }
            }

        }
    }

    if (type instanceof Y.Array) {
        yield* toHtmxArray(swap, yArrayIterator(type));
    }
    if (type instanceof Y.Map) {
        yield* toHtmxMap(swap, yMapIterate(type));
    }
}
  
 
type WithAction<T> = T & { action: "add" | "delete" };

class YDocStream {
    constructor(public doc: Y.Doc) {}  
    
    async * subdocs(abortSignal?: AbortSignal) :AsyncGenerator<WithAction<Y.Doc>>{

        console.log("YDocStream:subdocs", this.doc.guid);
        const doc = this.doc;
        console.log("YDocStream:subdocs:async", this.doc.guid, doc.subdocs);

        const subdocs = new Set<Y.Doc>(doc.subdocs);
        
        const add = (docs: Y.Doc) => Object.assign(doc, {action: "add" as const});
        const remove = (docs: Y.Doc) => Object.assign(doc, {action: "delete" as const});
        for (const doc of subdocs) {
            console.log("YDocStream:subdocs:doc", doc.guid, subdocs);
            yield add(doc);
        }
        const next = () => new Promise<WithAction<Y.Doc>[]>((resolve) => {
            if (doc.subdocs.difference(subdocs) || subdocs.difference(doc.subdocs)) {
                resolve([
                    ...Array.from(doc.subdocs.difference(subdocs)).map(add),
                    ...Array.from(subdocs.difference(doc.subdocs)).map(remove)
                ]);
            }


            function onUpdate(event: { added: Set<Y.Doc>, removed: Set<Y.Doc> }) {
                event.added.forEach(subdocs.add);
                event.removed.forEach(subdocs.delete);
                resolve([
                    ...Array.from(event.removed).map(remove),
                    ...Array.from(event.added).map(add)
                ])
                doc.off("subdocs", onUpdate);
            }

            doc.on("subdocs", onUpdate);
        })
        while (abortSignal?.aborted !== true) {
            const docs = await next();
            for (const doc of docs) {
                yield doc;
            }
        }  
    }

     async * components(abortSignal?: AbortSignal): AsyncGenerator<[string, Y.AbstractType<YEvent<any>>]> {
         const components = new Map<string, Y.AbstractType<YEvent<any>>>();
         const doc= this.doc;

         function waitForNewComponents(): Promise<[string, Y.AbstractType<YEvent<any>>][]> {
             return new Promise((resolve) => {
                 const newComponents = getNewEntries();
                 if (newComponents.length) {
                     resolve(newComponents);
                 } else {
                     doc.on('update', onDocUpdate);
                 }

                 function getNewEntries() {
                     return Array.from(doc.share.entries()).filter(([name]) => !components.has(name));
                 }

                 function onDocUpdate() {
                     const newComponents = getNewEntries();
                     if (newComponents.length) {
                         doc.off('update', onDocUpdate);
                         resolve(newComponents);
                     }
                 }
             });

         }

         while (abortSignal?.aborted !== true) {
             const newComponents = await waitForNewComponents();
             for (const comp of newComponents) {
                 yield comp;
             }
         }
         return "done";
     }
        
}

export class YDocSse {
    // private provider: YProvider;
    private docStream: YDocStream;
    // public get doc() {
    //     return this.provider.doc;
    // }
    
    constructor(public base:string,public doc:Y.Doc = new Y.Doc()) {
        console.log("new doc", doc.guid);
        this.docStream = new YDocStream(this.doc );
        
      
    }
     async * subdocs(swap:string, abortSignal?:AbortSignal):SSEIterator   {   
        console.log("subdocs", this.doc.guid, swap);
         for await (const subdoc of this.docStream.subdocs(abortSignal)) {
             const path = `${swap}:${subdoc.guid}`;
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

     async * components(swap:string, abortSignal?:AbortSignal):AsyncGenerator<ComponentIterator> {
         for await (const [key, comp] of this.docStream.components(abortSignal)) {
             const path = `${swap}:${key}`;

             async function* iterator() {
                 yield {
                     data: `<div id="${path}" hx-swap="innerHTML" sse-swap="${path}" />`,
                     event: swap,
                 }
                 yield* yComponentHtmx(path, comp);
             }

             yield iterator();
         }
     }

    async * docSse(abortSignal?: AbortSignal): SSEIterator {
        yield {
            data: `<div>
                       <div id="${this.doc.guid}:componnets" hx-swap="beforeEnd" sse-swap="${this.doc.guid}:componnets" ></div>
                       <div id="${this.doc.guid}:subdocs" hx-swap="beforeEnd" sse-swap="${this.doc.guid}:subdocs" ></div>
                   </div>`.replace(/\s+/g, " "),
        }


        yield*  this.subdocs(`${this.doc.guid}:subdocs`, abortSignal)
            
        //     concatAsync(
        //     this.subdocs(`${this.doc.guid}:subdocs`, abortSignal),
        //     flatAsync(this.components(`${this.doc.guid}:componnets`, abortSignal)),
        // );
    }


    sse( abortSignal?: AbortSignal) {
        const stream = this.docSse.bind(this, abortSignal);
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

export class YDocsManager {
    private docs: Map<string, YDocSse>;


    public onCreated?: (doc: Y.Doc) => void;
    
    public create?: (doc?: Y.Doc) => Y.Doc;

    constructor(onCreated?: (doc: Y.Doc) => void,  create: (doc?: Y.Doc) => Y.Doc = () => new Y.Doc()) {
        this.onCreated = onCreated;
        this.create = create;
        this.docs = new Map();
     }

    // Create or retrieve a Y.js document
    getOrCreateDoc(docName?: string): YDocSse {
        if (!this.docs.has(docName)) {
             this.docs.set(docName, new YDocSse(docName, this.create?.()));
             this.onCreated?.(this.docs.get(docName)!.doc);
        }
        return this.docs.get(docName)!;
    } 
     
 
}

export function withYPartyProvider(doc:YDocsManager,url:string, room:string ="default", docId?:string) {
    const providers = new Set<YProvider>();
    doc.create = () => {
        const doc= docId ? new Y.Doc({guid: docId}) : undefined;
        const provider = new YProvider(url, room,doc, {
            connect: true,
            disableBc: true,
            WebSocketPolyfill: ws,
        });
        providers.add(provider);
        return provider.doc;
    }
    return Object.assign(doc, {providers});
}




