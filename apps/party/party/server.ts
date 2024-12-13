import type * as Party from "partykit/server";
import { onConnect, type YPartyKitOptions } from "y-partykit";
import type { Doc } from "yjs";
import * as Y from "yjs";
import {YPartyKitStorage} from "y-partykit/storage";
import { SINGLETON_ROOM_ID } from "./rooms";
import {YDocSse} from "./htmx";
import {transformAsyncIterable} from "./stream/sse";

const env: Record<string, string> = {};

export default class DocServer implements Party.Server {
  yjsOptions: YPartyKitOptions = {};
  catalog?:  Y.Array<any>
  constructor(readonly  room: Party.Room) {}
  
  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
      console.log(
          `Connected:
                  id: ${conn.id}
                  room: ${this.room.id}
                  url: ${new URL(ctx.request.url).pathname}                  `
          
      );
      
      for (const [key, value] of Object.entries(this.room.env)) {
          if (typeof value === "string") {
              env[key] = value;
          }
        }
      
      await this.updateCount();

      return onConnect(conn, this.room, this.getOpts())
  }

    getOpts() {
        // options must match when calling unstable_getYDoc and onConnect
        const opts: YPartyKitOptions = {
            callback: { handler: (doc) => this.handleYDocChange(doc), 
               
            },
            persist: {
                mode: "snapshot"
            },
            load: async () => {
                // console.log("load",this.service.doc.guid, this.room.id, this.room.storage)
              // return this.service.doc
                const roomStorage = new YPartyKitStorage(this.room.storage);
                const ydoc = await roomStorage.getYDoc(this.room.id);
                
                return ydoc;
            }
        };
        
        return opts;
    }

    async updateCount() {
        // Count the number of live connections
        const count = [...this.room.getConnections()].length;
        // Send the count to the 'rooms' party using HTTP POST
        await this.room.context.parties.rooms.get(SINGLETON_ROOM_ID).fetch({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room: this.room.id, count }),
        });
    }


   async onStart(){
         for (const [key, value] of Object.entries(this.room.env)) {
           if (typeof value === "string") {
               env[key] = value;
           }
       }


   }
 
 
  handleYDocChange(doc: Doc) {
      console.log('handleYDocChange: ' ,
          doc.guid,
          doc.collectionid,
          doc.getArray("catalog").length)

  }


    async onMessage(message: string, sender: Party.Connection) {
        // let's log the message
        console.log(`connection ${sender.id} sent message: ${message} `);
        this.room.broadcast(message, [sender.id]);
    
    }

    async onRequest(req: Party.Request) {
        const roomStorage = new YPartyKitStorage(this.room.storage);
        /*debug any content /party/{}
          examples:
           /party/catalog
           /party/analysis
           /party/photos 
           /party/state
        */
        const doc=await roomStorage.getYDoc(this.room.id);
        console.log("onRequest", req.method, req.url, this.room.id, doc.guid)
        if(req.headers.get("accept")?.includes("text/event-stream")) {
            const path = req.url.split('/');
            
            
            const docStream= new YDocSse(path.slice(0, path.length-2).join("/"),  await roomStorage.getYDoc(this.room.id))
          
            return new Response(docStream.sse( ), { headers: { 
                "Content-Type": "text/event-stream; charset=utf-8",
                "Connection": "keep-alive",
                "Cache-Control": "no-cache,no-transform",
                "x-no-compression": "1"
            } });
        }

        if(req.headers.get("accept")?.includes("text/html")) {
            return new Response(`<html>
                    <head>
                         <script src="https://unpkg.com/htmx.org@2.0.2"></script>
                         <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
                        <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
                    </head>
                    <body>  
                         <div hx-ext="sse" sse-connect="${req.url}" sse-close="done" hx-ext="sse" sse-swap="message" hx-swap="beforeend" class="h-screen w-screen" >
                         
                        </div>
                    </body>
                    </html>
            `, {
                headers: {
                    "Content-Type": "text/html",
                    "Cache-Control": "no-cache,no-transform",
                    "x-no-compression": "1"

                }
            });
        }
        
        // if(req.method === "GET"  ) {
        //     const slug = req.url.split("/").pop()!;
        //     if(slug =="list") {
        //         return Response.json(roomStorage.db.list({}))
        //     }
        //     if(slug =="index") {
        //         const ydoc = await roomStorage.getYDoc(this.room.id);
        //         console.log("onRequest", req.method, req.url, ydoc.toJSON(), ydoc.getSubdocs())
        //         return Response.json(ydoc.toJSON())
        //     }
        //     if(slug =="catalog") {
        //         return Response.json(roomStorage.db.get("catalog"))
        //     }
        //     if(slug =="room") {
        //         return Response.json(roomStorage.db.get("room"))
        //     }
        //     if(slug =="rooms") {
        //         return Response.json(roomStorage.db.get("rooms"))
        //     }
        //     if(slug =="doc") {
        //
        //         const ydoc = await roomStorage.getYDoc(this.room.id);
        //         console.log("onRequest", req.method, req.url, ydoc.toJSON(), ydoc.getSubdocs())
        //
        //         console.log("list", roomStorage.db.list({}))
        //
        //         console.log("room.id", roomStorage.db.get(this.room.id))
        //         console.log("index", roomStorage.db.get("index"))
        //
        //
        //         return Response.json(ydoc.toJSON())
        //     }
        //     if(slug =="subdocs") {
        //         const ydoc = await roomStorage.getYDoc(this.room.id);
        //         return Response.json(ydoc.getSubdocs())
        //     }
        //    
        //     return Response.json({
        //         room: this.room.id,
        //         party: this.room.env.party,
        //         options:this.yjsOptions
        //     })
        // }
        
        return new Response("Unsupported method", { status: 400 });
    }
 
}

 
