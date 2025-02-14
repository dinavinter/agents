import {FastifyInstance, FastifyReply} from "fastify";
 import {yArrayIterator, filterEventAsync,yMapIterate, mapAsync} from "@cxai/stream";
 import fp from "fastify-plugin";
import {EventObject} from "xstate";
import * as Y from "yjs";

async function* revisions(agent: Y.Doc) {
    const map = agent.getMap<string>();
    let rev = undefined as string | undefined;

    const next = () => new Promise<string>((resolve) => {
        if (rev !== map.get("rev")) {
            resolve(map.get("rev") || "")
        }

        function onUpdate(event: Y.YMapEvent<string>) {
            console.log("update", map.get("rev"))
            if (rev !== map.get("rev")) {
                resolve(map.get("rev") || "")
                map.unobserve(onUpdate);
            }
        }

        map.observe(onUpdate);
    })


    while (true) {
        rev = await next();
        yield rev
    }
}


export async function routes(fastify: FastifyInstance) {
    // fastify.register(FastifySSEPlugin);
    // fastify.register(import('@fastify/formbody'))

     fastify.get('/agents/:agent/rev', async function handler(request, reply: FastifyReply) {
            const {agent:id} = request.params as {  agent: string };
            const agent = fastify.docs.getOrCreate(id);
         
            if (request.headers.accept === 'text/event-stream') {
             return reply.sse(async function* () {
                    for await (const rev of revisions(agent)) {

                     yield {
                         data: `<pre sse-swap="rev+html" hx-swap="outerHTML transition:true swap:1s settle:1s"  contenteditable class="z-60 w-full sticky bottom-0 right-0 p-2 bg-slate-50 text-slate-500 antialiased text-balance whitespace-normal text-end" 
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
                  for await (const rev of revisions(agent)) {
                      yield {
                          data:` <embed  class="h-full w-full" src="${rev}/view" sse-swap="message"  hx-swap="outerHTML transition:true swap:1s settle:1s" ></embed>`,
                          id: `embed-${rev}`,
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
                                  <div sse-swap="rev+html" hx-swap="outerHTML transition:true swap:1s settle:1s"  hx-ext="sse" sse-connect="rev" >
                                     
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
             const {defer, type} = value;
             
             const elapsed = Date.now() - lastEventTime;
             const wait = defer ? defer - elapsed : 10- elapsed;
             console.debug("type:", type, "\tdefer:", defer, "\telapsed:", elapsed, "\twaitFor:", wait)

             await new Promise((resolve) => setTimeout(resolve, wait));
             lastEventTime = Date.now();
             yield value;
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
             try {
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
                catch (e) {
                    console.error(e)
                    return {
                        data: data.toString(),
                        event: type,
                        type,
                        ...event
                    }
                }

         }
         return mapAsync(yArrayIterator(doc.getArray<Emitted>("emitted")),transform )
     }

     fastify.get('/agents/:agent/:rev/view', async function handler(request, reply: FastifyReply) {
        const {agent, rev} = request.params as {  rev: string ; agent :string};
         const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
       
        if (request.headers.accept === 'text/event-stream') {
            return reply.sse(async function* () {
                for await (const event of emitted(workflow)) {
                    console.debug("yield", event.type, event.offset)
                    if(event.data instanceof String) { 
                        yield event;
                    }
                    else {
                      console.warn( "skipping", event.type, event.data)
                    }
                }
            }())
        }
        reply.header('Cache-Control', 'no-store');
        reply.type('text/html')

         return reply.send(`<html>
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
            "@cx/ai":"https://esm.sh/@cxai/stream@1.0.6"
          }
        }
        </script> 

       <script src="https://unpkg.com/htmx.org@2.0.2"></script>
       <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
       <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
        <script src="https://esm.sh/@cxai/stream/ui"></script>


       </head>
       <body>  
            <div hx-ext="sse" sse-connect="events"   hx-swap="beforeend">
               <div  sse-swap="message"   hx-swap="beforeend"></div> 
            </div> 
       </body>
 </html>`)
    })

    fastify.get('/agents/:agent/:rev/context', async function handler(request, reply: FastifyReply) {
        const { agent,rev} = request.params as {
            agent:string,
            rev: string 
        };

        const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
        if(request.headers.accept === 'text/event-stream') {
            return reply.sse(async function* () {
                  for await (const [_] of yMapIterate(workflow.getMap("context"))) {
                        yield {
                            event: "message",
                            data: JSON.stringify(workflow.getMap("context").toJSON()),
                        } 
                  }
            }())
        }
        else {
            return reply.send(workflow.getMap("context").toJSON())
        }
 
       
    })
    fastify.get('/agents/:agent/:rev/context/attributes', async function handler(request, reply: FastifyReply) {
        const { agent,rev} = request.params as {
            agent:string,
            rev: string 
        };

        const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
        if(request.headers.accept === 'text/event-stream') {
            return reply.sse(async function* () {
                  for await (const [key, value] of yMapIterate(workflow.getMap("context"))) {
                    const {action,  newValue} = value
                        yield {
                            event: key,
                            data: typeof newValue ==="string" ? newValue : JSON.stringify(newValue),
                            action
                        } 
                  }
            }())
        }
        else {
            return reply.send(workflow.getMap("context").toJSON())
        }
  
    })

    fastify.get('/agents/:agent/:rev/state', async function handler(request, reply: FastifyReply) {
        const { agent,rev} = request.params as {
            agent:string,
            rev: string 
        };

        const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
        if(request.headers.accept === 'text/event-stream') {
            return reply.sse(async function* () {
                  for await (const  [key, value] of yMapIterate(workflow.getMap("state"))) {
                       const {  newValue} = value  
                        if(key==="value" && newValue) {
                            yield {
                                event: "message",
                                data: newValue
                             } 
                        } 
                  }
            }())
        }
        else {
            return reply.send(workflow.getMap("state").get("value"))
        } 
       
    })
    fastify.get('/agents/:agent/:rev/next', async function handler(request, reply: FastifyReply) {
        const { agent,rev} = request.params as {
            agent:string,
            rev: string 
        };

        const id= `${agent}:${rev}`
        const workflow = fastify.docs.getOrCreate(id);
        if(request.headers.accept === 'text/event-stream') {
            return reply.sse(async function* () {
                  for await (const  [key, value] of yMapIterate(workflow.getMap("next"))) {
                       const {action,  newValue} = value  
                        if(action === "update" || action === "add") {
                            yield {
                                event: "message",
                                data: key,
                                meta: "meta"  in newValue ? newValue.meta : undefined
                             } 
                        }
                        else if(action === "delete") {
                            yield {
                                event: key,
                                data: undefined,
                                meta: "meta"  in newValue ? newValue.meta : undefined
                             } 
                             yield {
                                event: "delete",
                                data: key,
                                meta: "meta"  in newValue ? newValue.meta : undefined
                             }
                        }
                  }
            }())
        }
        else {
            return reply.send(workflow.getMap("state").get("value"))
        } 
       
    })


    fastify.get('/agents/:agent/:rev/events', async function handler(request, reply: FastifyReply) {
        const {agent, rev} = request.params as {  rev: string ; agent :string};
        const id= `${agent}:${rev}` 

        const workflow = fastify.docs.getOrCreate(id);
        return reply.sse(async function* () {
            for await (const event of deferAsync(emitted(workflow))) {
                console.log("yield", event.type, event.offset)

                yield event;
            }
        }())
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
        return  reply.send(202);
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