import {FastifyInstance, FastifyReply} from "fastify";
 import {delayAsync, filterEventAsync, mapAsync} from "@/stream";
 import fp from "fastify-plugin";
import {EventObject} from "xstate";
import {yArrayIterator, yMapIterate} from "@/stream/yjs.ts";
import {createYjsHub} from "@/stream/hub.ts";
import * as Y from "yjs";

 export async function routes(fastify: FastifyInstance) {
    // fastify.register(FastifySSEPlugin);
    // fastify.register(import('@fastify/formbody'))

     fastify.get('/agents/:agent/rev', async function handler(request, reply: FastifyReply) {
            const {agent:id} = request.params as {  agent: string };
            const agent = fastify.docs.getOrCreate(id);
            const map = agent.getMap<string>();
         
            if (request.headers.accept === 'text/event-stream') {
             return reply.sse(async function* () {
                 let rev = undefined as string | undefined;

                 const next = () => new Promise<string>((resolve) => {
                     if (rev !== map.get("rev")) {
                         resolve(map.get("rev") || "")
                     }

                     function onUpdate(event: Y.YMapEvent<string>) {
                         console.log("update", event)
                         if (rev !== map.get("rev")) {
                             resolve(map.get("rev") || "")
                             map.unobserve(onUpdate);
                         }
                     }

                     map.observe(onUpdate);
                 })


                 while (true) {
                     rev = await next(); 

                     yield {
                         data: `<pre contenteditable class="z-60 w-full sticky bottom-0 right-0 p-2 bg-slate-50 text-slate-500 antialiased text-balance whitespace-normal text-end" 
                                          hx-ext="sse" sse-connect="view"  sse-swap="rev+html"
                                                        hx-swap="outerHTML transition:true swap:1s settle:1s">
                                     <span class="uppercase font-sans font-semibold">${id} agent</span> | <span class="uppercase font-sans font-semibold">Rev: <span class="font-mono font-light font-sans">${rev}</span>  </span>               
                                 </pre>     
                                `,
                         event: "rev+html",
                         id: rev
                     }

                     yield {
                         data: rev,
                         event: "rev",
                         id: rev
                     }

                 }

             }())

         }
        })


         fastify.get('/agents/:agent/view', async function handler(request, reply: FastifyReply) {
         const { agent:id} = request.params as {  agent: string };

         const agent = fastify.docs.getOrCreate(id);
         const map = agent.getMap<string>();
          if (request.headers.accept === 'text/event-stream') {
             return reply.sse(async function* () {
                 let rev= undefined as string | undefined;

                 const next = () => new Promise<string>((resolve) => {
                     if (rev !== map.get("rev")) {
                         resolve(map.get("rev") || "")
                     }

                     function onUpdate(event: Y.YMapEvent<string>) {
                         console.log("update", event)
                         if (rev !== map.get("rev")) {
                             resolve(map.get("rev") || "")
                             map.unobserve(onUpdate);
                         }
                     }

                     map.observe(onUpdate);
                 })


                 while (true) {
                     rev = await next();
                     yield {
                         data:` <embed  class="h-full w-full" src="${rev}/view" sse-swap="message"  hx-swap="outerHTML transition:true swap:1s settle:1s" ></embed>`,
                         id: `embed-${rev}`,
                     }
                     
                     yield {
                            data:`<pre contenteditable class="z-60 w-full sticky bottom-0 right-0 p-2 bg-slate-50 text-slate-500 antialiased text-balance whitespace-normal text-end" 
                                       sse-swap="rev+html"
                                       hx-swap="outerHTML transition:true swap:1s settle:1s">
                                     <span class="uppercase font-sans font-semibold">${id} agent</span> | <span class="uppercase font-sans font-semibold">Rev: <span class="font-mono font-light font-sans">${rev}</span>  </span>               
                                 </pre>               
                                `,
                            event: "rev+html",
                            id:rev
                    }

                     yield {
                         data:`Agent: <span class="uppercase font-sans font-semibold">${id}</span> Rev: <span class="font-mono">${rev}</span>                 
                               `,
                         event: "rev",
                         id:rev
                     }

                 }

             }())

         }
         reply.header('Cache-Control', 'no-store');
         reply.type('text/html')

         reply.send(`<!DOCTYPE html>
                        <html>
                          <head>
                            <title>Agent AI ${id}</title>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"> 
                           <script src="https://unpkg.com/htmx.org@2.0.2"></script>
                           <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
                           <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
                            <base href="${request.originalUrl}" /> 
                           </head>
                           <body class="h-screen" hx-ext="sse" sse-connect="view" > 

                               <div class="h-full w-full transition-all" sse-swap="message"  hx-swap="outerHTML transition:true swap:1s settle:1s" > 
                                    
                                </div> 
                                  <div sse-swap="rev+html" hx-swap="outerHTML "  >
                                  </div>
                             </body>
                     </html>`)
     })


     type VNodeAny ={
         props: Record<string, string>,
         type: string,
         children: VNodeAny[]
     }

     type Emitted= {
         format?: string,
         data: any,
         type: string,
         offset: number // milliseconds after start
         timestamp: number //actual time of event, milliseconds since epoch
         defer: number // milliseconds to defer event
     } & EventObject

     async function * deferAsync(stream: AsyncIterable<Emitted>): AsyncGenerator<Emitted> {
         let lastEventTime = Date.now();
         //defer events if didn't pass the defer time from the previous event
         for await (const value of stream) {
             const elapsed = Date.now() - lastEventTime;
             const {defer} = value;
             await new Promise((resolve) => setTimeout(resolve, defer? defer - elapsed: 0));
             lastEventTime = Date.now();
         }
     }
     async function * deferOffsetAsync<T>(stream: AsyncIterable<Emitted>): AsyncGenerator<Emitted> {
         let start = Date.now();

         for await (const value of stream) {
             const {offset} = value;
             //adapt time to original timeline
             value.timestamp = value.timestamp + offset;
                const elapsed = Date.now() - start;
                const defer = offset - elapsed;
                await new Promise((resolve) => setTimeout(resolve, 
                    Math.max(0, defer)));
                yield value;
                
          }
     }

     function emitted(doc: Y.Doc){
         doc.shouldLoad  && doc.load();

         function toFragment(node:VNodeAny, target:  Y.XmlElement) {

             for (const [key, value] of Object.entries(node.props || {})) {
                 target.setAttribute(key, value?.toString() ?? "");

             }
             node.children?.length && target.insert(0, node.children.map(c=> toFragment(c, new Y.XmlElement(c.type))));
             return target;

         }
         function fromNode({data}:{data:VNodeAny}) {
             doc.getXmlFragment(":html").insert(0, [toFragment(data, new Y.XmlElement(data.type))]);
             return doc.getXmlFragment(":html");
         }

         function transform({data, type,format, ...event}:Emitted) {
             return {
                 data: format === 'json' ? JSON.stringify(data) :
                     format === 'node' ? fromNode({data}).toJSON() :
                         format === 'raw' ?  data.replace(/\s+/g, ' ') :
                             data,
                 event: type,
                 type,
                 ...event
             }

         }
         return mapAsync(yArrayIterator(doc.getArray<Emitted>("emitted")),transform )
     }

     fastify.get('/agents/:agent/:rev/view', async function handler(request, reply: FastifyReply) {
        const {agent, rev} = request.params as {  rev: string ; agent :string};
         const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
       
        if (request.headers.accept === 'text/event-stream') {
            return reply.sse(deferAsync(emitted(workflow)));
        }
        reply.header('Cache-Control', 'no-store');
        reply.type('text/html')

        reply.send(`<html>
      <head>
        <title>Agent AI ${id}</title>
        <base href="${request.originalUrl}" />

         <script type="importmap">
        {
          "imports": {
            "atomico": "https://unpkg.com/atomico",
            "@atomico/hooks":"https://esm.sh/@atomico/hooks",
            "@atomico/hooks/use-slot":"https://esm.sh/@atomico/hooks@4.4.1/use-slot",
            "@atomico/store":"https://esm.sh/@atomico/store"
            
          }
        }
        </script> 

       <script src="https://unpkg.com/htmx.org@2.0.2"></script>
       <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
       <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
 

       </head>
       <body>  
            <div hx-ext="sse" sse-connect="events"   hx-swap="beforeend">
               <div  sse-swap="message"   hx-swap="beforeend"></div> 
            </div>
 
       </body>
 </html>`)
    })

    fastify.get('/agents/:agent/:rev/events', async function handler(request, reply: FastifyReply) {
        const {agent, rev} = request.params as {  rev: string ; agent :string};
        const id= `${agent}:${rev}` 

        const workflow = fastify.docs.getOrCreate(id);
        return reply.sse(delayAsync(emitted(workflow)))
    })

    fastify.get('/agents/:agent/:rev/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, rev,event} = request.params as {  rev: string ; agent :string,event:string};
        const id= `${agent}:${rev}`

        const workflow = fastify.docs.getOrCreate(id);
        return reply.sse(filterEventAsync(emitted(workflow), event))
    })

    fastify.post('/agents/:agent/:rev/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, rev,event} = request.params as {  rev: string ; agent :string,event:string};
        const id= `${agent}:${rev}`
        const data = request.body as object;
        const workflow = fastify.docs.getOrCreate(id);
        workflow.getArray<EventObject>("events").push([{...data, type: event}]);
        return  reply.send('sent at '+ new Date().toISOString());
    })

    fastify.get('/agents/:agent/:rev/:service/events/:event', async function handler(request, reply: FastifyReply) {
        const { agent,rev, service, event} = request.params as {
            agent:string,
            rev: string,
            event: string,
            service: string
        };
        const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
        
        return reply.sse(filterEventAsync(emitted(workflow), `@${service}.${event}`))
    })


}

export default routes;