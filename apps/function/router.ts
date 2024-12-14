import { parseArgs } from "jsr:@std/cli/parse-args";
import {createYjsHub, serviceHub} from "./stream/hub.ts";
import {YjsDocManager} from "./provider/party.ts";
const flags = parseArgs(Deno.args, {
    string: ["url" , "room", "collection", "doc", ],
});


function getHttpHandler(hub:serviceHub) {

    return (request: Request): Response => {
        if (request.url.includes('/sse')) {
            return yjsSseRouter()
        }
        if (request.url.includes('/json')) {
            return jsonRouter()
        }
        if (request.url.includes('/doc')) {
            return docRouter()
        }

        return new Response(JSON.stringify({
            guid: hub.doc.guid,
            collectionid: hub.doc.collectionid,
            synced: hub.doc.isSynced,
            ...hub.doc.toJSON()
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        });

        function yjsSseRouter() {
            const slug = request.url.split('/').pop() || 'emitted';
            return new Response(encodeSse(hub.array(slug).readableStream(request.signal)), {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            })
        }


        function jsonRouter() {
            return new Response(JSON.stringify(hub.state), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*'
                }
            })

        }

        function docRouter() {
            return new Response(JSON.stringify({
                guid: hub.doc.guid,
                collectionid: hub.doc.collectionid,
                synced: hub.doc.isSynced
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
                controller.enqueue(`data: ${JSON.stringify(chunk.data || chunk)}\n\n`);
            }
        })).pipeThrough(new TextEncoderStream())
    }
}

 

const docManager = new YjsDocManager(flags.url);
const doc  =docManager.getOrCreate(flags.room || "test", true);

const router=getHttpHandler(createYjsHub(doc));


Deno.serve({ port: 4242, hostname: "0.0.0.0" }, router);

