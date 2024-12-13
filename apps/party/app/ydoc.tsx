import * as Y from 'yjs';
import {YEvent} from "yjs";
import {yArrayIterator, yMapIterate} from "./stream/yjs";
import {concatAsync, flatAsync} from "./stream";
import type * as Party from "partykit/server";
import YProvider from "y-partykit/provider";
// Configuration and state management

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
        async function* subdocsAsync(doc: Y.Doc): AsyncGenerator<WithAction<Y.Doc>> {
            const subdocs = new Set<Y.Doc>(doc.getSubdocs());
            const add = (docs: Y.Doc) => Object.assign(doc, {action: "add" as const});
            const remove = (docs: Y.Doc) => Object.assign(doc, {action: "delete" as const});
            for (const doc of subdocs) {
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
         
        return {
            [Symbol.asyncIterator]: subdocsAsync(this.doc) 
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
    
    constructor( public doc:Y.Doc) {
        
        this.docStream = new YDocStream(this.doc);
        
      
    }
     async * subdocs(swap:string, abortSignal?:AbortSignal):SSEIterator   {   
         for await (const subdoc of this.docStream.subdocs(abortSignal)) {
             const path = `${swap}:${subdoc.guid}`;
             if(subdoc.action === "add") {
                 yield {
                     data: `<div id="${path}" hx-swap="beforeEnd"  hx-ext="sse" sse-connect="${path}" />`,
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

    async * docSse(abortSignal: AbortSignal): SSEIterator {
        yield {
            data: `<div   >yo
                       <div id="${this.doc.guid}:componnets" hx-swap="beforeEnd" sse-swap="${this.doc.guid}:componnets" ></div>
                       <div id="${this.doc.guid}:subdocs" hx-swap="beforeEnd" sse-swap="${this.doc.guid}:subdocs" ></div>
                   </div>`.replace(/\s+/g, " "),
        }


        yield* concatAsync(
            flatAsync(this.components(`${this.doc.guid}:componnets`, abortSignal)),
            this.subdocs(`${this.doc.guid}:subdocs`, abortSignal)
        );
    }


    sse( abortSignal: AbortSignal) {
        const stream = this.docSse.bind(this, abortSignal);
        const encoder = new TextEncoder();
        return new ReadableStream({
            start(controller) {
                async function pump() {
                    for await (const {event, data} of stream()) {
                        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data.replace("\n", "")}\n\n`));
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

    constructor(onCreated?: (doc: Y.Doc) => void) {
        this.onCreated = onCreated;
        this.docs = new Map();
     }

    // Create or retrieve a Y.js document
    getOrCreateDoc(docName: string): YDocSse {
        if (!this.docs.has(docName)) {
             this.docs.set(docName, new YDocSse(new Y.Doc({guid: docName})));
             this.onCreated?.(this.docs.get(docName)!.doc);
        }
        return this.docs.get(docName)!;
    } 
    
    
    fetchRouter(event: FetchEvent) {
        const url = new URL(event.request.url);
        const path = url.pathname.split("/")
        console.log("fetch", path);
        if (url.pathname.startsWith("/events") || url.pathname.startsWith("events")) {
            const docName = path.pop();
            console.log("events", path, docName);

            const doc = this.getOrCreateDoc(docName || "default");
            event.respondWith(new Response(doc.sse(event.request.signal), {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            }));
        }
       
    }
 
}

export function withYPartyProvider(doc:YDocsManager,url:string, room?:string) {
    const providers = new Set<YProvider>();
    doc.onCreated = (doc) => {
        const provider = new YProvider(url, room || doc.guid, doc, {
            connect: true,
            disableBc: true,
        });
        providers.add(provider);
        console.log("connected", provider.wsconnected, doc.isLoaded, doc.isSynced);
    }
    return Object.assign(doc, {providers});
}

export const docsManager = new YDocsManager();



