import {FastifyInstance, FastifyReply} from "fastify";
import {EventMessage, FastifySSEPlugin} from "fastify-sse-v2";
import {ActorRefFrom, AnyActorRef, AnyMachineSnapshot, AnyStateMachine, createActor} from "xstate";
import {sendHtml} from "./html";
import {html} from "atomico";
import {Streamable} from "./components/streamable";
import {VNodeAny} from "atomico/types/vnode";
import {SnapshotReader} from "./components/snapshot";
import {filterAsync, filterEventAsync, mapAsync} from "../stream";
import {ReadableStream,} from 'node:stream/web';
import {serviceMachine} from "./services";


function snapshotStream(actor: AnyActorRef) {
    return new ReadableStream<AnyMachineSnapshot>({
        start(controller) {
            const snapshot = actor.getSnapshot();
            controller.enqueue(snapshot);
            actor.subscribe({
                next: (state) => {
                    controller.enqueue(state);
                },
                error: (error) => {
                    console.error('error', error);
                    controller.error(error);
                },
                complete: () => {
                    // if (actor.getSnapshot().output) {
                    //     controller.enqueue(actor.getSnapshot().output);
                    // }
                    // controller.close();
                }
            })
            if (actor.getSnapshot().status !== "active") {
                actor.start();
            }

        }

    });
}

export function routes(fastify: FastifyInstance) {
    fastify.register(FastifySSEPlugin);

    const services: Map<string,
        ActorRefFrom<typeof serviceMachine>
    > = new Map();

 
    async function getOrCreateWorkflow(agent: string, workflow: string) {
        if (!services.has(workflow)) {
            services.set(workflow, await createWorkflow(agent, workflow));
        }
        return services.get(workflow)!;

        async function createWorkflow(agent: string, workflow: string) {
            const {machine} = await import(`../agents/${agent}.ts`) as { machine: AnyStateMachine };
            return createActor(serviceMachine, {
                id: workflow,
                input: {
                    name: agent,
                    logic: machine
                }
            })
        }
    }


    fastify.get('/agents/:agent', async function handler(request, reply: FastifyReply) {
        const {agent} = request.params as { agent: string };
        reply.redirect(`/agents/${agent}/${generateActorId()}`);

        function generateActorId() {
            return Math.random().toString(36).substring(2, 8);
        }


    })

    fastify.get('/agents/:agent/:workflow', async function handler(request, reply: FastifyReply) {
        const {agent, workflow} = request.params as { agent: string, workflow: string };
        const actor = await getOrCreateWorkflow(agent, workflow);
        const service= actor.getSnapshot().context.service as AnyActorRef;
        if (request.headers.accept === 'text/event-stream') {
            service.on('render', ({node}: { node: VNodeAny }) => {
                if (node?.render) {
                    const rendered = node.render() as unknown as {
                        type: string,
                        name: string,
                        nodeName: string,
                        attributes: any,
                        innerHTML: string
                    };

                    reply.sse({
                        data: JSON.stringify({
                            type: rendered.type,
                            props: rendered.attributes,
                            innerHTML: rendered.innerHTML
                        })
                    })
                }

            })

            service.start();
            reply.serializer((v: any) => v);
            return reply;
        }
        sendHtml(reply, html`
            <${Streamable} src="${reply.request.originalUrl}">

            </Streamable>
        `);
    })

    fastify.get('/agents/:agent/:workflow/snapshot', async function handler(request, reply: FastifyReply) {
            const {agent, workflow} = request.params as { agent: string, workflow: string };
            const actor = await getOrCreateWorkflow(agent, workflow);
            return reply.sse(mapAsync(snapshotStream(actor), (snapshot) => ({
                data: JSON.stringify({
                    value: snapshot.value,
                    status: snapshot.status,
                    context: snapshot.context,
                    tags: snapshot.tags
                })
            })));
        }
    )
    fastify.get('/agents/:agent/:workflow/logger', async function handler(request, reply: FastifyReply) {
          
            const {agent, workflow} = request.params as { agent: string, workflow: string };
            const service = await getOrCreateWorkflow(agent, workflow);
            const {logStream} = service.getSnapshot().context;
            return reply.sse(mapAsync(logStream, (e) => ({
                data: JSON.stringify(e)
            })));
             
            // service.on("*", (event) => {
            //     reply.sse({
            //         data: JSON.stringify(event)
            //     });
            // })
            // return reply;
             
        }
    )


    fastify.get('/agents/:agent/:workflow/logs', async function handler(request, reply: FastifyReply) {
        const {agent, workflow} = request.params as { agent: string, workflow: string };

        reply.type('text/html');
        sendHtml(reply, html`
            <${SnapshotReader} src="/agents/${agent}/${workflow}/snapshot"/>`);

    })

    fastify.get('/agents/:agent/:workflow/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, workflow, event} = request.params as { agent: string, workflow: string, event: string };
        const actor = await getOrCreateWorkflow(agent, workflow);
        actor.getSnapshot().context.service.on(event, (event: EventMessage) => {
            reply.sse(event);
        })
        return reply;

    })

    fastify.get('/agents/:agent/:workflow/:service/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, workflow, service, event} = request.params as {
            agent: string,
            workflow: string,
            event: string,
            service: string
        };
        const actor = await getOrCreateWorkflow(agent, workflow);
         const serviceActor = (actor.getSnapshot().context.service as AnyActorRef)?.getSnapshot().children?.get(service);
            
        if(serviceActor){
            serviceActor.on(event, (event: EventMessage) => {
                reply.sse(event);
            })
        }
        
        // actor.on(`@${service}.${event}`, (event: unknown) => {
        //         reply.sse(event as EventMessage);
        //  })
        

        return reply;

    })


}


/*
<html><head>
                            <title>Agent AI</title>
                             <script type="importmap">
                            {
                              "imports": {
                                "atomico": "https://unpkg.com/atomico",
                                "animejs":"https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
                                "@atomico/hooks":"https://esm.sh/@atomico/hooks",
                                "@atomico/hooks/use-slot":"https://esm.sh/@atomico/hooks@4.4.1/use-slot"
                               
                                
                              }
                            }
                            </script>
           
                            </head>
                            <body>
                                <div id="app">
                                ${agent} ${workflow}
                                </div>
 */