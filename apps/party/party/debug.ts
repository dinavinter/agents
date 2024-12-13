import * as Y from "yjs";
import type * as Party from "partykit/server";

function htmlCatalog() {
    return new Response(`<head>
                         <script src="/streaming-element.js"></script>
                    <script src="/transforms/text-encode-transform.js"></script>
                    </head>

                    <streaming-element id=target></streaming-element>
                 

                  <script>
                      const targetDiv = document.querySelector('#target');

                      async function streamDirectlyIntoDOM() {
                        const response = await fetch('./stream',
                            {
                                mode: 'same-origin',
                                headers: {
                                    'Cache-Control': 'no-cache, no-store'
                                }
                            });
                
                        await response.body
                            .pipeThrough(new TextDecoderStream())
                            .pipeTo(targetDiv.writable);
                    }
                    
                    document.addEventListener('DOMContentLoaded', streamDirectlyIntoDOM);
                </script>


              `, {
        headers: {'Content-Type': 'text/html; charset=utf-8'}

    })
}

async function jsonCatalog(catalog: Y.Array<any>) {

    return  Response.json(catalog.toJSON())
}
async function streamCatalog(catalog: Y.Array<any>) {


    const stream = new ReadableStream({
        start(controller) {
            catalog?.observe(p => {
                const chunk = p.delta.filter(a => a.insert).flatMap(a => a.insert);
                // Get the data and send it to the browser via the controller
                controller.enqueue(JSON.stringify(chunk));
                // Check chunks by logging to the console
                console.log("chunk", chunk);
            });

        },
    });

    return new Response(stream, {headers: {"Content-Type": 'text/html; charset=utf-8'}})
}



// For debug, dump the current state of the yDoc
// When run locally, this can be seen at http://127.0.0.1:1999/party/catalog 
async function onRequest(req: Party.Request) {
    const roomStorage = new YPartyKitStorage(this.room.storage); 
    const ydoc = await roomStorage.getYDoc(this.room.id);
    if (!ydoc) {
        return new Response("No ydoc yet", {status: 404});
    }

    if (req.method === "GET" && req.url.endsWith("/catalog")) {
        this.catalog = this.catalog || connectCatalog(ydoc)

        return await jsonCatalog(this.catalog!)
    }

    if(req.method === "GET" && req.url.endsWith("/catalog/view")) {

        return htmlCatalog();
    }



    return new Response("Unsupported method", { status: 400 });

}

// const roomStorage = new YPartyKitStorage(this.room.storage);
// // const ydoc = await roomStorage.getYDoc(this.room.id);
// this.catalog = this.catalog || connectCatalog(ydoc)

// if (req.method === "GET") {
//     if (!ydoc) {
//         return new Response("No ydoc yet", { status: 404 });
//     }
//     const messages = ydoc.getArray("catalog").toArray();
//     return new Response(JSON.stringify(messages, null, 2));
// }