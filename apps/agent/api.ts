// Import the framework and instantiate it
import 'atomico/ssr/load';
import {html, render} from 'atomico';
import {Component} from './component.js';
import Fastify, {FastifyReply} from 'fastify' 
import * as fs from "node:fs";
import {AnyActorRef, AnyStateMachine, createActor, fromPromise, PromiseActorLogic} from "xstate";
import {logger} from "./logger";
import {ReadableStream} from "node:stream/web";
import {Readable} from "node:stream";
import {StreamData, StreamingTextResponse, streamObject, streamToResponse} from "ai";
import {tokenService} from "sap-ai-token";
import {Thread}  from './temp';
import {renderActor} from "./render";

tokenService.credentialsFromEnv();
 
const fastify = Fastify({
    logger: true
})
// Declare a route

fastify.get('/component.js', async function handler(request, reply) {
    reply.type('application/javascript')
    reply.send(fs.readFileSync('component.js'))

})

fastify.get('/temp.js', async function handler(request, reply) {
    reply.type('application/javascript')
    reply.send(fs.readFileSync('temp.js'))

})
const noop = (v) => v;

fastify.get('/agents/:agent', async function handler(request, reply) {
    const { agent } = request.params as {agent:string};
    const create = await import(`./agents/${agent}.ts`).then((m) => m.default) as (create:typeof  createActor<AnyStateMachine  >) => AnyActorRef;

        const service = create((logic, options) => createActor(
            logic.provide({
                actors: {
                    terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                }
            }), options));


        logger(service)
        const data = new StreamData();

        const stream = new ReadableStream({
            start(controller) {
                service.start();

                // Push initial state
                // controller.enqueue(service.getSnapshot().value);
                const snapshot = service.getSnapshot();
                data.append({
                    state: snapshot.value,
                    context: snapshot.context
                });

                // Listen for state updates
                service.subscribe((state) => {
                    const snapshot = service.getSnapshot();
                    // controller.enqueue(service.getSnapshot().value);
                    data.append({
                        state: snapshot.value,
                        context: snapshot.context,
                        event: state.event
                    });

                });
            },
            cancel() {
                service.stop();
            }
        });
     // const dataStream = new Readable({
    
    // const stramable= new StreamingTextResponse(stream);

    reply.serializer(noop);

    const response = reply.raw;

    streamToResponse(stream,response, {
        headers: {
            'Content-Type': 'text/json',
            'Transfer-Encoding': 'chunked',
            'Connection': 'keep-alive',
        }
    }, data);
    // reply.send(response);
    
})

 
fastify.get('/', async function handler(request, reply) {
    
    sendHtml(reply, html`
           <${Component} value=${100}>
            <h1>Message from server!</h1>
        </${Component}>
    `)
})

fastify.get('/temp', async function handler(request, reply) {
    sendHtml(reply, html`
        <${Thread} ></${Thread}>
    `)
})
export function sendHtml(reply:FastifyReply,  html:any )
{
    reply.type('text/html')
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
          <script src="./component.js" type="module"></script>
      <script src="./temp.js" type="module"></script>

      ${html.render() } `
    )
}


// Run the server!
try {
    await fastify.listen({port: 5002})
} catch (err) {
    fastify.log.error(err)
    process.exit(1)
}