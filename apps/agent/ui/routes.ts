import {FastifyInstance, FastifyReply} from "fastify";
import {EventMessage, FastifySSEPlugin} from "fastify-sse-v2";
import {ActorRefFrom, AnyActorRef, AnyStateMachine, createActor, fromPromise} from "xstate";
import {type replyWithHtml, sendHtml} from "./html";
import {html} from "atomico";
import {Streamable} from "./components/streamable";
import {VNodeAny} from "atomico/types/vnode";




export function routes(fastify: FastifyInstance) {
    fastify.register(FastifySSEPlugin);
    
    const services: Map<string,
        ActorRefFrom<AnyStateMachine> & {html: replyWithHtml }
    > = new Map();
    
    async function getOrCreateWorkflow(agent:string, workflow:string) {
        if (!services.has(workflow)) {
            services.set(workflow, await createWorkflow(agent, workflow));
        }
        return services.get(workflow)!;

        async function createWorkflow(agent: string, workflow: string) {
            const create = await import(`../agents/${agent}.ts`).then((m) => m.default) as (create: typeof createActor<AnyStateMachine>) => AnyActorRef;
            const service = create((logic, options) => createActor(
                logic.provide({
                    actors: {
                        terminal: fromPromise(({input}: { input: string }) => Promise.resolve("something")),
                    }
                }), {
                    id: workflow, 
                    ...options
                }));

            return {
                ...service,
                getSnapshot: service.getSnapshot.bind(service),
                start:service.start.bind(service),
                subscribe: service.subscribe.bind(service),
                on: service.on.bind(service),
                async html(reply:FastifyReply){
                    sendHtml(reply, html`<${Streamable} url="${reply.request.originalUrl}" > </${Streamable}>`)
                }
            };

        }
    }


    fastify.get('/agents/:agent', async function handler(request, reply:FastifyReply) {
        const {agent} = request.params as { agent: string };
        reply.redirect( `/agents/${agent}/${generateActorId()}`);

        function generateActorId() {
            return Math.random().toString(36).substring(2, 8);
        }


    })

    fastify.get('/agents/:agent/:workflow', async function handler(request, reply:FastifyReply) {
        const {agent, workflow} = request.params as { agent: string, workflow:string };
        const {html, on, start} = await getOrCreateWorkflow(agent, workflow);

        if(request.headers.accept === 'text/event-stream') {
            on('render', ({node}:{node:VNodeAny } ) => {
                if(node?.render){
                    const rendered = node.render() as unknown as {type:string, name:string, nodeName:string, attributes: any, innerHTML:string};

                    reply.sse({
                        data: JSON.stringify({
                            type: rendered.type,
                            props: rendered.attributes,
                            innerHTML: rendered.innerHTML
                        })
                    })
                }
               
            })

            start(); 
            reply.serializer((v: any) => v);
            return reply;
        }

        await html(reply);
    })


    fastify.get('/agents/:agent/:workflow/events/:event', async function handler(request, reply:FastifyReply) {
        const {agent, workflow,event} = request.params as { agent: string, workflow:string , event:string};
        const actor  =await getOrCreateWorkflow(agent, workflow);
        actor.on(event, (event:EventMessage ) => {
            reply.sse(event);
        })
        return reply;

    })

    fastify.get('/agents/:agent/:workflow/:service/events/:event', async function handler(request, reply:FastifyReply) {
        const {agent, workflow,service, event} = request.params as { agent: string, workflow:string , event:string, service:string};
        const actor  =await getOrCreateWorkflow(agent, workflow);
        const serviceActor = actor.getSnapshot().children[service];
        if(serviceActor) {
            serviceActor.on(event, (event:unknown) => {
                reply.sse( event as EventMessage);
            })
        }
 
        return reply;

    })


}
