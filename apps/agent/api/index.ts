import {FastifyInstance, FastifyReply} from "fastify";
import {  FastifySSEPlugin} from "fastify-sse-v2";
import { 
    AnyStateMachine 
} from "xstate";
import {sendHtml} from "./ui/htmx";
import {html} from "atomico";
import {delayAsync, filterEventAsync, mapAsync} from "../stream";
import {getOrCreateWorkflow} from "../agents/agent-store";
import {routes as ideRoutes} from "./ide";
export function routes(fastify: FastifyInstance) {
    fastify.register(FastifySSEPlugin);
    fastify.register(import('@fastify/formbody')) 
    ideRoutes(fastify)

    // fastify.register(import('./debug'))
 
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
            return reply.sse(delayAsync(mapAsync(hub.emitted, ({data,event, type}) => ({
                data: data,
                event: event || type
            })))); 
        }
        
        sendHtml(reply, agent,workflow);
    })
 
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
        return reply.sse(filterEventAsync(hub.emitted, event))  
    })

    fastify.post('/agents/:agent/:workflow/events/:event', async function handler(request, reply: FastifyReply) {
        const {agent, workflow, event} = request.params as { agent: string, workflow: string, event:string  };
        const data = request.body as object;
        const actorRef = await getOrCreateWorkflow(agent, workflow);
        const {service} = actorRef.getSnapshot().context;
        service.send({type: event, ...data});
        return  reply.send('sent at '+ new Date().toISOString());
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
 