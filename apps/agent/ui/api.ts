import {
    AnyActorRef,
    AnyStateMachine,
    CallbackActorLogic,
    createActor, enqueueActions,
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
 function generateActorId() {
    return Math.random().toString(36).substring(2, 8);
}


type replyHtml = (reply:FastifyReply) => Promise<void>;

const services: Map<string, 
     AnyActorRef & {html: replyHtml ,streamId:string}
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
           const componentStream = createStream(`${workflow}`);
            const service = create((logic, options) => createActor(
                logic.provide({
                    actions:{
                        render: enqueueActions(({enqueue,system}, params:{html?:render, node?:VNodeAny, stream:string} | {html:render, node?:VNodeAny,stream:string}) => {
                            const stream = getOrCreateStream(`${workflow}${params.stream}`);
                            const node = params.node ||(params.html && params.html(html) )
                            const data =node?.render ? node.render() : node

                            console.log('render to ',`${workflow}${params.stream}`, data);

                            if(system.get(`stream.${params.stream}`) === undefined) {
                                enqueue.spawnChild('renderer', {
                                    id: params.stream,
                                    systemId: `stream.${params.stream}`,
                                    input: {
                                        slug: params.stream
                                    }
                                })
                            }
                            enqueue.sendTo(params.stream, {
                                type: 'render',
                                node
                            })
                            // stream.push({data: data}); 
                        })
                    },
                    actors: {
                        terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                        renderer:fromCallback(({receive,input:{html:h,slug}}) => {
                            console.log('create renderer', slug);
                            h && componentStream.push({  data: h(html).render() }); 
                            const stream = getOrCreateStream(`${workflow}${slug}`);
                            receive(({node, type}) => {
                                const data =node.render ? node.render() : node
                                console.log('renderer: render to ',`${workflow}${slug}`, data);

                                node && stream.push({ data: data});
                                     
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
                        basePath: `${workflow}`,
                        streamPath(streamId:string){
                            return `${workflow}/${streamId}`
                        }
                    },
                    ...options
                }));
            service.start();
            return {
                ...service, 
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
        const {html} = await getOrCreateWorkflow(agent, workflow); 
        if(request.headers.accept === 'text/event-stream') {
            reply.sse(readStream(workflow));
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

 
}
export function sendHtml(reply:FastifyReply,  node:VNodeAny )
{
    // reply.type('text/html')
    reply.send(`<html>
      <head>
            <base href="${reply.request.protocol}://${reply.request.hostname}${reply.request.originalUrl}/" target="_blank" />

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