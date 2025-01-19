import {FastifyInstance, FastifyReply} from "fastify";
 import {delayAsync, filterEventAsync, mapAsync} from "@/stream";
 import fp from "fastify-plugin";
import {EventObject} from "xstate";
import {yArrayIterator, yMapIterate} from "@/stream/yjs.ts";
import {createYjsHub} from "@/stream/hub.ts";
import * as Y from "yjs";

type VNodeAny ={
    props: Record<string, string>,
    type: string,
    children: VNodeAny[]
}
 export async function routes(fastify: FastifyInstance) {
    // fastify.register(FastifySSEPlugin);
    // fastify.register(import('@fastify/formbody'))

   
    type Emitted= {
        format?: string,
        data: any,
        type: string
    } & EventObject
 
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

    
    
     fastify.get('/agents/:agent/view', async function handler(request, reply: FastifyReply) {
         const { agent:id} = request.params as {  agent: string };

         const agent = fastify.docs.getOrCreate(id);
         const map = agent.getMap<string>();
         let rev= map.get("rev");
         if (request.headers.accept === 'text/event-stream') {
             return reply.sse(async function* () {

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
                         data:`<div sse-swap="embed" hx-swap="outerHTML"> 
                                <embed  class="h-screen w-screen" src="${rev}/view" >
                             </div>`,
                         id: `embed-${rev}`,
                         event: `embed`
                     }
                     yield {
                         data: rev,
                         event: "rev",
                         id:rev
                     }

                 }

             }())

         }
         reply.header('Cache-Control', 'no-store');
         reply.type('text/html')

         reply.send(`<html>
      <head>
        <title>Agent AI ${id}</title>
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
        <base href="${request.originalUrl}" />
 

       </head>
       <body> 
        <div hx-ext="sse" sse-connect="view"  >
                <header hx-ext="sse" sse-connect="view" class="bg-slate-50 ticky top-0 z-10 backdrop-filter backdrop-blur  border-b border-gray-200 items-start justify-start py-2 ">
        
                   <div class="text-sm breadcrumbs *:hover:text-slate-500 *:text-gray-500 *:hover:shadow-sm"> 
                       <a href="#" class="text-slate-400 hover:text-slate-300">${id}</a> 
                      <span class="mx-2 text-gray-500">/</span> 
                      <a href="#" class="text-slate-400 hover:text-slate-300" >
                         <span  sse-swap="rev" hx-swap="innerHTML">
                                ${rev}                 
                        </span>
                       </a> 
                    </div>
                </header> 
                 <div sse-swap="embed" hx-swap="outerHTML"> 
                    <embed  class="h-screen w-screen" src="${rev}/view" >
                 </div>
           </div>
 
         </body>
 </html>`)
     })


     fastify.get('/agents/:agent/:rev/view', async function handler(request, reply: FastifyReply) {
        const {agent, rev} = request.params as {  rev: string ; agent :string};
         const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
       
        if (request.headers.accept === 'text/event-stream') {
            return reply.sse(delayAsync(emitted(workflow)));
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