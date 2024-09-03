import {FastifyInstance, FastifyReply} from "fastify";
import {getOrCreateWorkflow} from "../agents/agent-store";
import {AnyMachineSnapshot, StateValue} from "xstate";
import {castAsync, mapAsync} from "../stream";
import {html} from "atomico";
import {JsonStream, Snapshot} from "../components";
import {sendHtml} from "./ui/html";

export default function routes(fastify: FastifyInstance) {
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
            sendHtml(reply,  html`
                <${JsonStream} src="snapshot">
                    <${Snapshot} slot="template"/>
                </${JsonStream}>
            `);

        }
    )
    fastify.get('/agents/:agent/:workflow/logs', async function handler(request, reply: FastifyReply) {

            const {agent, workflow} = request.params as { agent: string, workflow: string };
            const service = await getOrCreateWorkflow(agent, workflow);
            const {hub} = service.getSnapshot().context;

            return reply.sse(mapAsync(hub.inspected, (e) => ({
                data: JSON.stringify(e)
            })));

        }
    )
}