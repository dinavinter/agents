import {FastifyInstance, FastifyReply} from "fastify";
 import {delayAsync, filterEventAsync, mapAsync} from "@/stream";
 import fp from "fastify-plugin";
import {EventObject} from "xstate";
import {yArrayIterator} from "@/stream/yjs.ts";
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

    fastify.get('/runtime/:workflow', async function handler(request, reply: FastifyReply) {
        const { workflow:id} = request.params as {  workflow: string };
      
        const workflow = fastify.docs.getOrCreate(id);
       
        if (request.headers.accept === 'text/event-stream') {
            return reply.sse(delayAsync(emitted(workflow)));
        }
        reply.header('Cache-Control', 'no-store');
        reply.type('text/html')

        reply.send(`<html>
      <head>
        <title>Agent AI</title>
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
        <base href="/runtime/${id}/" />
 

       </head>
       <body> 
        <header class="bg-slate-50 ticky top-0 z-10 backdrop-filter backdrop-blur  border-b border-gray-200 items-start justify-start py-2 ">

           <div class="text-sm breadcrumbs *:hover:text-slate-500 *:text-gray-500 *:hover:shadow-sm"> 
              <span class="mx-2 text-gray-500">/</span> 
              <a href="#" class="text-slate-400 hover:text-slate-300">${id}</a> 
            </div>
        </header> 
            <div hx-ext="sse" sse-connect="/runtime/${id}"  sse-swap="message"   hx-swap="beforeend">
             </div>
 
         </body>
 </html>`)
    })

    fastify.get('/runtime/:workflow/events', async function handler(request, reply: FastifyReply) {
        const { workflow:id} = request.params as {   workflow: string };
        const workflow = fastify.docs.getOrCreate(id);
        return reply.sse(emitted(workflow))
    })

    fastify.get('/runtime/:workflow/events/:event', async function handler(request, reply: FastifyReply) {
        const { workflow:id,event} = request.params as {  workflow: string, event:string };
        const workflow = fastify.docs.getOrCreate(id);
        return reply.sse(filterEventAsync(emitted(workflow), event))
    })

    fastify.post('/runtime/:workflow/events/:event', async function handler(request, reply: FastifyReply) {
        const { workflow:id, event} = request.params as {  workflow: string, event:string  };
        const data = request.body as object;
        const workflow = fastify.docs.getOrCreate(id);
        workflow.getArray<EventObject>("events").push([{...data, type: event}]);
        return  reply.send('sent at '+ new Date().toISOString());
    })

    fastify.get('/runtime/:workflow/:service/events/:event', async function handler(request, reply: FastifyReply) {
        const { workflow:id, service, event} = request.params as {
            
            workflow: string,
            event: string,
            service: string
        };
        const workflow = fastify.docs.getOrCreate(id);
        
        return reply.sse(filterEventAsync(emitted(workflow), `@${service}.${event}`))
    })


}

export default routes;