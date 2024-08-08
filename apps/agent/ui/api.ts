import {
    AnyActorRef,
    AnyStateMachine,
    CallbackActorLogic,
    createActor,
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
import {renderActor, renderCallbackActor, StreamActorLogic} from "./render";
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



const services: Map<string, 
     AnyActorRef & {stream: Pushable<EventMessage>,streamId:string}
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

function readStream<T extends EventMessage>(id:string) {
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
            const stream = getOrCreateStream(`${workflow}/workflow`);
          
            

            const service = create((logic, options) => createActor(
                logic.provide({
                    actors: {
                        terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                        renderer:fromCallback(({receive, self}) => { 
                            receive(({node}) => {
                                    node && stream.push({ data: node.render()});
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
                            href: `${workflow}/stream/${workflow}`
                        } satisfies StreamActorLogic
                    }
                }), {
                    id: workflow,
                    // inspect:loggerInspector,
                    input:{
                        basePath: `${workflow}/stream`,
                        streamPath(streamId:string){
                            return `${workflow}/stream/${streamId}`
                        }
                    },
                    ...options
                }));
            service.start();
            return {
                ...service,
                stream,
                streamId:`workflow`
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
        await getOrCreateWorkflow(agent, workflow);

        reply.type('text/html');
        reply.header('Cache-Control', 'no-store');
        sendHtml(reply, html`
            <${Streamable} url="${`${workflow}/stream/workflow`}"> 
            </${Streamable}>`); 
    })


    fastify.get('/view/:agent/:workflow/stream/:stream', async function handler(request, reply:FastifyReply) {
        const {agent, workflow,stream} = request.params as { agent: string, workflow:string , stream:string};
        await getOrCreateWorkflow(agent, workflow);
        console.log('streaming', `${workflow}/${stream}`, streams.has(`${workflow}/${stream}`));
        const data = readStream(`${workflow}/${stream}`);

        reply.sse(data);
        request.socket.on('close', () => {
            console.log("closing");
            // data.return();
        })

        return reply;
    })


    fastify.get('/stream/text/:stream', async function handler(request, reply) {
        const {stream} = request.params as { stream: string };
        console.log('streaming', stream, streams.has(stream));
        const data = readStream(stream);
        reply.sse(data); 
            request.socket.on('close', () => {
                console.log("closing");
                // data.return();
            })
        
        return reply;
 
        
    })
 
    
    fastify.get('/stream/:agent/:workflow/:state/:child', async function handler(request, reply) {
        const {agent, workflow,child, state} = request.params as { agent: string, workflow:string, child:string , state:string};
        const service = services.get(workflow);
        if (service) { 
            await waitFor(service, s=>s.matches(state), {timeout: 1000});
            console.log('subscribing to', child,state,"\tcurrent state", service.getSnapshot().value, "\tchild: ", service.system.get(child)?.id, "\tcontext: ",service.getSnapshot().context );
            service.system.get(child)?.subscribe((state: string | undefined) => {
                reply.sse({data: state});
            })
        }
        return reply;

    })

}
export function sendHtml(reply:FastifyReply,  node:VNodeAny )
{
    // reply.type('text/html')
    reply.send(`<html>
      <head>
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