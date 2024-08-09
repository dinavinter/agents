import {
    ActorRefFrom,
    AnyActorRef,
    AnyStateMachine,
    CallbackActorLogic,
    createActor, enqueueActions, EventObject,
    fromCallback,
    fromPromise,
    waitFor
} from "xstate";
import {logger, loggerInspector} from "../utils/logger";
import {
    ReadableStream,
    ReadableStreamDefaultReader,
    TransformStream,
    WritableStream,
    WritableStreamDefaultWriter
} from "node:stream/web";
import {c, html} from "atomico";
import {FastifyInstance, FastifyReply} from "fastify";
import {render, renderActor, renderCallbackActor, StreamActorLogic} from "./render";
import {VNodeAny} from "atomico/types/vnode";
import {Streamable} from "./components/streamable";
import {EventMessage, FastifySSEPlugin} from "fastify-sse-v2";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import  * as ai from 'ai'
import  {Pushable, pushable} from "it-pushable";
import {TextStream} from "./components/text";
 function generateActorId() {
    return Math.random().toString(36).substring(2, 8);
}


type replyHtml = (reply:FastifyReply) => Promise<void>;

const services: Map<string, 
     ActorRefFrom<AnyStateMachine> & {html: replyHtml ,streamId:string}
> = new Map();


const Component = c(() => {
    return html`<div><slot></slot></div>`;
},{
    
})

// class StreamData  implements Pushable<EventMessage>{
//     private writeable: WritableStream<any>;
//     private readable: ReadableStream<any>;
//     private writer: WritableStreamDefaultWriter<any>;
//     private reader: ReadableStreamDefaultReader<any>;
//      buffer: EventMessage[] = [];
//
//     constructor() {
//         const { writable, readable } = new TransformStream<EventMessage,EventMessage>();
//         this.writeable = writable;
//         this.readable = readable;  
//         this.writer = writable.getWriter();
//         this.reader = readable.getReader();
//
//
//     }
//
//     append(event:EventMessage){
//         this.buffer.push(event);
//         return this.writer.write(event);
//
//     }
//
//     async * stream(){
//         while(true){
//             const {done, value} = await this.reader.read();
//             console.log('streaming value', value);
//             if(done){
//                  yield "done";
//             }
//             yield value;
//
//         }
//     }  
// }

const streams = new Map<string, Pushable<EventMessage>>();
const createStream = (id:string) => {
    console.log('create stream', id);
    const stream = pushable<EventMessage>({
        objectMode: true
    });
    streams.set(id, stream);
    return stream;
}
async function  *clonePushable<T>(source:Pushable<T>, clone:Pushable<T>= pushable<T>({objectMode: true})):AsyncGenerator<T>{
    for await (const event of source) {
        clone.push(event);
        yield event;
    }
}
const getOrCreateStream = (id:string) => {
    if(!streams.has(id)) {
         createStream(id);
   }
    return  streams.get(id)!;
}

function readStream(id:string) {
    if(!streams.has(id)) {
        createStream(id);
    }
    const stream = streams.get(id)!;
    const clone = pushable<EventMessage>({objectMode: true});
    streams.set(id, clone)
    return clonePushable(stream, clone);  
}

 


  function getStreamEl(workflow: string, slug: string | undefined) {
      const href = `${workflow}${slug && `/${slug}`}`;

      const textStream = c(({src}) => html`
          <host shadowDom>${src}</host>`, {
          props: {
              src: {type: String, reflect: true, value: href}
          },
          base: TextStream
      });

      const htmlStream = c(({src}) => html`
          <host shadowDom>${src}</host>`, {
          props: {
              src: {type: String, reflect: true, value: href}
          },
          base: Streamable
      });
      return {href, textStream, htmlStream};
  }

function toStreamEl(service: ActorRefFrom<AnyStateMachine>, slug?: string) {
    const workflow = service.id;

    const {href, textStream, htmlStream} = getStreamEl(workflow, slug);
    // const {textStream} =Streamer[slug]  

    const stream = getOrCreateStream(href);
    const streamEl = (s?: string) => getStreamEl(workflow, s);
    streamEl.textStream = textStream;
    streamEl.htmlStream = htmlStream;
    streamEl.href = href;
    streamEl.stream = stream;
    streamEl.service = (id?: string, parse?: (e: any) => string | undefined) => {
        parse = parse || ((e) => e.context || e);
        const systemService = id ? service.system.get(id) : service;
        const stream = getOrCreateStream(`${workflow}/${id}`);
        systemService.subscribe(
            (event: any) => {
                stream.push({
                    data: parse(event)
                });
            }
        );
        return getStreamEl(workflow, id);
    }
    streamEl.event = (type?: string, parse?: (e: any) => EventMessage) => {
        // parse = parse || ((e) => e);
        // const stream = getOrCreateStream(`${workflow}/${type}`);
        // service.subscribe(
        //     (event:any) => {
        //         stream.push(parse(event));
        //     }
        // );

        return getStreamEl(workflow, `events/${type}`)
    }
    return streamEl;
}

export function routes(fastify: FastifyInstance) {
    fastify.register(FastifySSEPlugin); 
    const noop = (v: any) => v;
    
    
    
    async function getOrCreateWorkflow(agent:string, workflow:string) {
        if(!services.has(workflow)) {
            services.set(workflow, await createWorkflow(agent, workflow));
        }
        return services.get(workflow)!;

        async function createWorkflow(agent:string, workflow:string) {
            const create = await import(`../agents/${agent}.ts`).then((m) => m.default) as (create: typeof createActor<AnyStateMachine>) => AnyActorRef;
            const componentStream = createStream(`${workflow}/component`);
            
            const service = create((logic, options) => createActor(
                logic.provide({ 
                    actors: {
                        terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                        renderer:fromCallback(({receive,self,input}) => {
                                const defaultEl: render = (h, {href}) => h`<></>`;
                                const defaultOptions = {
                                    slug: self.id,
                                    render: defaultEl
                                }

                                const {render: h, slug} = {...defaultOptions, ...input};

                                console.log('create renderer', slug);
                            const streamEl = toStreamEl(service, slug);

                            const node = h(html, streamEl);

                                console.log('renderer: node to ', {node});
                                console.log('renderer:render render to ', {rendered: node.render && node.render()});
                                componentStream.push({
                                    data: node.render ? node.render() : node
                                });

                                receive(({node, render}) => {
                                    node = node || render(html, streamEl)
                                    const data = node.render ? node.render() : node
                                    console.log('renderer: render to ', streamEl.href, data);
                                    streamEl.stream.push({data: data});
                                })
                            }
                        ) satisfies renderCallbackActor,
                        stream: {
                            ...fromCallback(({receive, self}) => {
                                console.log('create stream', self.id);
                                const stream = getOrCreateStream(`${workflow}/${self.id}`);
                                receive((event) => {
                                    stream.push(event);
                                }) 
                            }),
                            href: `${workflow}`
                        } satisfies StreamActorLogic
                    }
                }), {
                    id: workflow,
                    // inspect:loggerInspector,
                    input:{
                        stream: {
                            event: (type:string)=> getStreamEl(workflow, `events/${type}`)
                        },
                        basePath: `${workflow}`,
                        streamPath(streamId:string){
                            return `${workflow}/${streamId}`
                        }
                    },
                    ...options
                }));

            const workflowStream = createStream(workflow);
            service.on('*', workflowStream.push);

            return {
                ...service, 
                start:service.start.bind(service),
                subscribe: service.subscribe.bind(service),
                on: service.on.bind(service),
                streamId:workflow,
                async html(reply:FastifyReply){ 
                    sendHtml(reply, html`<${Streamable} url="${reply.request.originalUrl}" > </${Streamable}>`)
                }
            };
        }

    }


    fastify.get('/view/:agent', async function handler(request, reply:FastifyReply) {
        const {agent} = request.params as { agent: string };
         const workflowId = generateActorId();   
         reply.serializer(noop);
         reply.type('text/html');
         reply.redirect( `/view/${agent}/${workflowId}`);
    })
    
    fastify.get('/view/:agent/:workflow', async function handler(request, reply:FastifyReply) {
        const {agent, workflow} = request.params as { agent: string, workflow:string };
        const {html, on, start} = await getOrCreateWorkflow(agent, workflow); 
        on('agent', (event:any ) => {
            console.log('agent event', event);
        })
        on('*', (event:any ) => {
            console.log('workflow event', event);
        })

        if(request.headers.accept === 'text/event-stream') {
            // reply.sse(readStream(workflow));
            // reply.sse({data: "hello"});
            on('render', (event:{node:VNodeAny} ) => {
                reply.sse({data: event.node.render()});
            })
            
            start();
            return reply;
        }  
        
        reply.type('text/html');
        reply.header('Cache-Control', 'no-store');
        await html(reply);
    })


    fastify.get('/view/:agent/:workflow/:stream', async function handler(request, reply:FastifyReply) {
        const {agent, workflow,stream} = request.params as { agent: string, workflow:string , stream:string};
        // await getOrCreateWorkflow(agent, workflow);
        console.log('streaming', `${workflow}/${stream}`, streams.has(`${workflow}/${stream}`));
        const data = readStream(`${workflow}/${stream}`);

        reply.sse(data);
        request.socket.on('close', () => {
            console.log("closing");
            data.return({
                event: 'close'
            })
        }) 
        

        async function streamLog(){
            for await (const event of readStream(`${workflow}/${stream}`)) {
                console.log('streaming', `${workflow}/${stream}`, event);
                 
            }
        }
        streamLog().catch(console.error).then(() => {
            console.log('streaming done' , `${workflow}/${stream}`);
        });
        return reply;
    })

    fastify.get('/view/:agent/:workflow/services/:service', async function handler(request, reply:FastifyReply) {
        const {agent, workflow,service} = request.params as { agent: string, workflow:string , service:string};
        const {system}  =await getOrCreateWorkflow(agent, workflow);
        const systemService = system.get(service);
        if(!systemService) {
            reply.code(404).send(`Service ${service} not found`);
            return;
        }

        reply.sse({data:systemService.getSnapshot().context})
        
        systemService.subscribe(
            (event:any) => {
                reply.sse({
                    data:  event.context || JSON.stringify( event)
                });
            }
        );
        
        return reply;
        
    })

    fastify.get('/view/:agent/:workflow/events/:type', async function handler(request, reply:FastifyReply) {
        const {agent, workflow,type} = request.params as { agent: string, workflow:string , type:string};
        const actor  =await getOrCreateWorkflow(agent, workflow);
        console.log('actor events', agent, type,actor.id);

        actor.on(type, (event:EventMessage | {event: "render" , render:render}) => {
            console.log('actor events:',workflow, agent, type,event);
            // if(event.event === "render" && "render" in event) {
            //     reply.sse({data: event.render(html, toStreamEl(actor))});
            // }
            reply.sse(event);
        })

        return reply;

    })

 
}
export function sendHtml(reply:FastifyReply,  node:VNodeAny )
{
    // reply.type('text/html')
    reply.send(`<html>
      <head>
            <base href="${reply.request.protocol}://${reply.request.hostname}${reply.request.originalUrl}" target="_blank" />

<!--        <link rel="import" href="https://esm.sh/polymate/polymate-view.html"> </link>-->
         <script type="importmap">
        {
          "imports": {
            "atomico": "https://unpkg.com/atomico",
            "animejs":"https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
            "@atomico/hooks":"https://esm.sh/@atomico/hooks@4.4.1"
            
          }
        }
        </script> 
<!--         <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js" ></script>-->
       <script src="/ui/components/streamable.js" type="module"></script>
       <script  src="/ui/components/svg.js" type="module"> </script>
        <script  src="/ui/components/text.js" type="module"> </script>

       </head>
       <body>
           <style>
                body {
                     font-family: sans-serif;
                }
                #app {
                    display: block;
                    margin: 0 auto;
                    max-width: 800px;
                    padding: 20px;
                }
              </style>
           <div id="app">
                 ${node.render() } 
           </div>
         </body>
         </html>
`
    )
}


/*
async function agentAsStream(agent:string, workflow:string){
    const create = await import(`./agents/${agent}.ts`).then((m) => m.default) as (create: typeof createActor<AnyStateMachine>) => AnyActorRef;

    // const service=services[workflow];

    const dataStream= new ai.StreamData();
    const stream = new ReadableStream({
        start(controller) {
   
    const render:renderActor = fromPromise(({input:{render}})=> {
        return new Promise((resolve) => {
            controller.enqueue(render(html).render());
            dataStream.append(render(html).render());
            resolve()
        })
    })
    services.set(workflow,create((logic, options) => createActor(
        logic.provide({
            actors: {
                terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                render: render
            }
        }), {
            id: workflow,
            // state:service?.getSnapshot(),
            ...options
        })))
         services.get(workflow)?.start();

        },
        cancel() {
            services.get(workflow)?.stop();
        }
    });
    return {
        stream,
        dataStream
    }
}
*/
 