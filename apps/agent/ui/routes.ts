import {FastifyInstance, FastifyReply} from "fastify";
import {  FastifySSEPlugin} from "fastify-sse-v2";
import {
    ActorRefFrom, 
    AnyMachineSnapshot,
    AnyStateMachine,
    createActor, StateValue
} from "xstate";
import {sendHtml} from "./htmx";
import {html} from "atomico";
import {Streamable} from "./components/streamable";
import {castAsync, filterEventAsync, mapAsync} from "../stream";
import { serviceMachine} from "./inspector";
import {JsonStream} from "./components/json";
import {Snapshot} from "./components/snapshot";
import { workflowStream} from "./render"; 

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
            const service= createActor(serviceMachine, {
                id: workflow,
                input: {
                    name: agent,
                    logic: machine
                }
            })
            service.on("*", (event) => {
                console.log(`${agent} Event:`, event);
            })
            return service;
            
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
        const {service, hub} = actor.getSnapshot().context;
        if (request.headers.accept === 'text/event-stream') {
            service.start();
            return reply.sse(mapAsync(filterEventAsync(hub.emitted, "render"), ({data,event}) => ({
                data: data,
                event: event
            })));
                ;   
            
        }
        const meta = (service as unknown as {logic: AnyStateMachine})?.logic?.config?.meta;
        if( meta?.render) {
             sendHtml(reply,agent,  meta.render({stream: workflowStream(workflow), html}));
             service.start();
            return reply;
        }
            
        
        sendHtml(reply, agent,workflow);
    })

    fastify.get('/agents/:agent/:workflow/snapshot', async function handler(request, reply: FastifyReply) {
            const {agent, workflow} = request.params as { agent: string, workflow: string };
            const actor = await getOrCreateWorkflow(agent, workflow);
            const {hub} = actor.getSnapshot().context; 
           

            if (request.headers.accept === 'text/event-stream') {
                function* stateValue(state: StateValue | undefined): Iterable<string> {
                    if (typeof state === "string") {
                        yield state;
                    } else if (typeof state === "object" && state !== null) {
                        for (const [key, value] of Object.entries(state)) {
                            yield key;
                            yield* stateValue(value);
                        }
                    }
                }
                
                return reply.sse(mapAsync(castAsync<AnyMachineSnapshot>(hub.snapshot), (snapshot) => ({
                    data: JSON.stringify({
                        value: Array.from(stateValue(snapshot.value)).join("."),
                        status: snapshot.status,
                        context: snapshot.context,
                        tags: snapshot.tags
                    })
                })));
            }

            reply.type('text/html');
            sendHtml(reply,agent, html`
                <${JsonStream} src="snapshot" >
                    <${Snapshot} slot="template" />
                </${JsonStream}>
            `);

        }
    )
    fastify.get('/agents/:agent/:workflow/logs', async function handler(request, reply: FastifyReply) {

            const {agent, workflow} = request.params as { agent: string, workflow: string };
            const service = await getOrCreateWorkflow(agent, workflow);
            const { hub} = service.getSnapshot().context;

            return reply.sse(mapAsync(hub.inspected, (e) => ({
                data: JSON.stringify(e)
            })));

        }
    )
    
    fastify.get('/agents/:agent/:workflow/events', async function handler(request, reply: FastifyReply) {
        const {agent, workflow} = request.params as { agent: string, workflow: string };
        const service = await getOrCreateWorkflow(agent, workflow);
        const { hub} = service.getSnapshot().context;
        return reply.sse((hub.emitted))
    })


    fastify.get('/agents/:agent/:workflow/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, workflow, event} = request.params as { agent: string, workflow: string, event: string };
        const service = await getOrCreateWorkflow(agent, workflow);
        const { hub} = service.getSnapshot().context; 
        return reply.sse(filterEventAsync((hub.emitted), event))  
    })

    fastify.get('/agents/:agent/:workflow/:service/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, workflow, service, event} = request.params as {
            agent: string,
            workflow: string,
            event: string,
            service: string
        };
        const actor = await getOrCreateWorkflow(agent, workflow);
        const hub=actor.getSnapshot().context.hub;
        return reply.sse(filterEventAsync((hub.emitted), `@${service}.${event}`)) 
    })


}
 