import {AnyActorRef, AnyStateMachine, createActor, fromCallback, fromPromise, waitFor} from "xstate";
import {logger, loggerInspector} from "../utils/logger";
import {ReadableStream} from "node:stream/web";
import {c, html} from "atomico";
import {FastifyInstance, FastifyReply} from "fastify";
import {renderActor, renderCallbackActor} from "./render";
import {VNodeAny} from "atomico/types/vnode";
import {Streamable} from "./components/streamable";
import {FastifySSEPlugin} from "fastify-sse-v2";
import {StreamData} from "ai";
import path from "node:path";
import fastifyStatic from "@fastify/static";
 function generateActorId() {
    return Math.random().toString(36).substring(2, 8);
}



const services: Record<string, AnyActorRef> = {};


const Component = c(() => {
    return html`<div><slot></slot></div>`;
},{
    
})


export function routes(fastify: FastifyInstance) {
    fastify.register(FastifySSEPlugin); 
    const noop = (v: any) => v;


    fastify.get('/view/:agent', async function handler(request, reply:FastifyReply) {
        const {agent} = request.params as { agent: string };
         const workflowId = generateActorId();   
         reply.serializer(noop);
         reply.type('text/html');
         sendHtml(reply, html`
            <${Streamable} url="${agent}/${workflowId}">
            </${Streamable}>`) 
    })
    
    fastify.get('/view/:agent/:workflow', async function handler(request, reply) {
        const {agent, workflow} = request.params as { agent: string, workflow:string };
        const create = await import(`../agents/${agent}.ts`).then((m) => m.default) as (create: typeof createActor<AnyStateMachine>) => AnyActorRef;
         const service = create((logic, options) => createActor(
            logic.provide({
                actors: {
                    terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                    renderer:fromCallback(({receive}) => {
                            receive(({node}) => {
                                reply.sse({ data: node.render()});
                            })
                        }
                    ) satisfies renderCallbackActor
                }
            }), {
                id: workflow, 
                 inspect:loggerInspector,
                ...options
            }));

        service.start();

        request.socket.on('close', () => {
            console.log("closing");
            service.stop();
        })

        return reply;
      

    })
    
    fastify.get('/api/:agent/:actor/:state', async function handler(request, reply) {
        
        sendHtml(reply, html`
            <${Component} value=${100}>
                <h1>Message from server!</h1>
                
            </${Component}>`)
    })

}
export function sendHtml(reply:FastifyReply,  node:VNodeAny )
{
    // reply.type('text/html')
    reply.send(`<html>
      <head>
        <link rel="import" href="https://esm.sh/polymate/polymate-view.html"> </link>
         <script type="importmap">
        {
          "imports": {
            "atomico": "https://unpkg.com/atomico",
            "animejs":"https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
            "@atomico/hooks":"https://esm.sh/@atomico/hooks@4.4.1"
            
          }
        }
        </script> 
         <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js" ></script>
       <script src="/ui/components/streamable.js" type="module"></script>
       <script  src="/ui/components/svg.js" type="module"> </script>
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

    const dataStream= new StreamData();
    const stream = new ReadableStream({
        start(controller) {
   
    const render:renderActor = fromPromise(({input:{render}})=> {
        return new Promise((resolve) => {
            controller.enqueue(render(html).render());
            dataStream.append(render(html).render());
            resolve()
        })
    })
    services[workflow]= create((logic, options) => createActor(
        logic.provide({
            actors: {
                terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                render: render
            }
        }), {
            id: workflow,
            // state:service?.getSnapshot(),
            ...options
        }));
    services[workflow].start();

        },
        cancel() {
            services[workflow].stop();
        }
    });
    return {
        stream,
        dataStream
    }
}