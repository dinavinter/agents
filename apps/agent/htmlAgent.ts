import {AnyActorRef, AnyStateMachine, createActor, fromCallback, fromPromise, waitFor} from "xstate";
import {logger} from "./logger";
import {ReadableStream} from "node:stream/web";
import {c, html} from "atomico";
import {FastifyInstance, FastifyReply} from "fastify";
import {renderActor, renderCallbackActor} from "./render";
import {VNodeAny} from "atomico/types/vnode";
import fs from "node:fs";
import {Streamable} from "./streamable";
import {FastifySSEPlugin} from "fastify-sse-v2";
import {StreamData} from "ai";
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

    fastify.get('/view/streamable.js', async function handler(request, reply) {
        reply.type('application/javascript')
        reply.send(fs.readFileSync('streamable.js'))

    })

    fastify.get('/view/:agent', async function handler(request, reply:FastifyReply) {
        const {agent} = request.params as { agent: string };
        const create = await import(`./agents/${agent}.ts`).then((m) => m.default) as (create: typeof createActor<AnyStateMachine>) => AnyActorRef;
        const workflowId = generateActorId(); // generate a unique ID

        // services[workflowId]= create((logic, options) => createActor(
        //     logic.provide({
        //         actors: {
        //             terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something"))
        //         }
        //     }), {
        //         id: workflowId,
        //         ...options
        //     }));
         
  
         reply.serializer(noop);
         reply.type('text/html');
         sendHtml(reply, html`
            <${Streamable} url="${agent}/${workflowId}">
                <h1>${workflowId}</h1> 
            </${Streamable}>`)
         // reply.header('Connection', 'keep-alive');
         // reply.hijack()
        
     
        // reply.send(response);

    })
    
    fastify.get('/view/:agent/:workflow', async function handler(request, reply) {
        const {agent, workflow} = request.params as { agent: string, workflow:string };
        const create = await import(`./agents/${agent}.ts`).then((m) => m.default) as (create: typeof createActor<AnyStateMachine>) => AnyActorRef;
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
                ...options
            }));

        async function* events() {    
            
          
        }
        service.start();
        // await  waitFor( service, state => state.matches('done') || state.type === 'final');
        // console.log("done")
        // reply.sse({ event: 'close' })

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
export function sendHtml(reply:FastifyReply,  html:VNodeAny )
{
    // reply.type('text/html')
    reply.send(`
    <script type="importmap">
    {
      "imports": {
        "atomico": "https://unpkg.com/atomico",
        "ai": "https://unpkg.com/ai@3.3.0",
        "ai/rsc": "https://esm.sh/ai@3.3.0/rsc",
        "@ai-sdk/ui-utils": "https://esm.sh/@ai-sdk/ui-utils@0.0.24"
      }
    }
    </script> 
<!--      <script src="https://unpkg.com/ai" type="module"></script>-->
      <script src="https://esm.sh/ai@3.3.0/rsc" type="module"></script>
       <script src="./streamable.js" type="module"></script>

      ${html.render() } `
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