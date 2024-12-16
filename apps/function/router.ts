import { parseArgs } from "jsr:@std/cli/parse-args";
import {createYjsHub, serviceHub} from "./stream/hub.ts";
import {YjsDocManager} from "./provider/hp.ts";
import {YDocSse} from "./yjs/htmx.ts";
import {mapAsync} from "./stream/monads.ts";
import {readableStream, sseReadableStream} from "./stream/readable.ts";
const flags = parseArgs(Deno.args, {
    string: ["url" , "room", "collection", "doc", ],
});

import * as Y from "yjs";
import { EventMessage } from "./stream/sse.ts";
import {yArrayIterator} from "./yjs/array.ts";

function docHandler(doc:Y.Doc) {
    // hub.doc.shouldLoad && hub.doc.load();
    // const doc = hub.doc;
    return (request: Request): Response => {
        const abortController = new AbortController();
        if(request.signal){
            request.signal.addEventListener('abort', () => {
                abortController.abort();
            });
        }
        const path = new URL(request.url).pathname.split('/');
        const type = path.pop();
        if (type=="html") {
            return  new Response(`<html>
            <head>
                 <script src="https://unpkg.com/htmx.org@2.0.2"></script>
                 <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
                <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
            </head>
            <body>  
                 <div hx-ext="sse" sse-connect="htmx" sse-close="done" hx-ext="sse" sse-swap="${doc.guid}" hx-swap="beforeend" class="h-screen w-screen flex  justify-evenly flex-col  *:m-3.5 overscroll-y-auto"/>
            </body>
            </html> `, {
                headers: {
                    "content-type": "text/html"
                }
            })
        }
        if (type=="htmx") { 
                return new Response(sseReadableStream(mapAsync(new YDocSse(doc.guid, doc).docSse(),async (chunk:EventMessage)=> {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return chunk;
            }),abortController.signal), {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            })
        }
        if (type=="sse") {
            return yjsSseRouter()
        }
        if (type=="json") {
            return jsonRouter()
        }
        if (type=="doc") {
            return docRouter()
        }
 
        return new Response(JSON.stringify({
            id: doc.guid,
            href: doc.getMap().get("href"),
            rev: doc.getMap().get("rev"),
            loaded: doc.isLoaded,
            synced: doc.isSynced ,
            should_load: doc.shouldLoad,
            meta: doc.meta,
            subdocs: Array.from(doc.subdocs).map(({guid, collectionid, meta}) => ({guid, collectionid, meta})),
            ...Array.from(doc.share.entries()).reduce((acc, [key, value]) => {
                acc[key] = value.toJSON();
                return acc
            }, {} as Record<string, any>)
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        });
         function yjsSseRouter() {
            const slug = path.pop() || 'emitted';
            console.log("slug", slug);
            const array = doc.getArray(slug);
            console.log("array", array.toJSON());
            const toEventMessage = (value: any): EventMessage => {
                if ("data" in value) {
                    const {data, ...rest}   = value;
                      return {
                       data: data?.toString() || "",
                      ...rest 
                    }
                }
                return {data: typeof value=== "string" ? value : JSON.stringify(value) || ""};
            }
            return new Response(sseReadableStream(mapAsync(mapAsync(yArrayIterator(array),toEventMessage),async (chunk)=> {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return chunk;
            }),abortController.signal), {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            })
        }

        
        function jsonRouter() {
            const type  =path.pop() || 'map';
            console.log("p", path);
            const part=path[1] || "";
            type AbstractTypeConstructor= {new (): Y.AbstractType<any>}
             const component : AbstractTypeConstructor  =
                 type === 'map' ?  Y.Map : 
                type === 'array' ?  Y.Array :
                type === 'text' ?  Y.Text:
                type === 'xml' ?  Y.XmlFragment :    
                Y.Map;

            console.log("json", part, type);
           console.log("json", doc.get(part,component).toJSON());

            return new Response(JSON.stringify(doc.getMap(part).toJSON()), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            })

        }

        function docRouter() {
            return new Response(JSON.stringify({
                guid: doc.guid,
                collectionid: doc.collectionid,
                synced: doc.isSynced
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }


    }

    function encodeSse (readable: ReadableStream) {
        return readable.pipeThrough(new TransformStream({
            transform(chunk, controller) {
                controller.enqueue(`data: ${chunk.data || chunk}\n\n`);
            }
        })).pipeThrough(new TextEncoderStream())
    }
}


const docManager = new YjsDocManager(flags.url);

function docRouter(request: Request) { 
    const room=new URL(request.url).pathname.split('/')[1] || flags.room || "default";
    if(room=="favicon.ico") {
        return new Response("not found", {status: 404});
    }
    const doc  =docManager.getOrCreate(room );
    const router=docHandler(doc);
    return router({
        ...request,
        url: request.url.replace(`/${room}`, '')
    }); 
}




Deno.serve({ port: 4242, hostname: "0.0.0.0" }, docRouter);

