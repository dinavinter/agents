import {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import type {FastifyXstatePlugin} from "../plugins/xstate";


const routes: FastifyXstatePlugin = async function (instance, options) {
    const fastify = instance.withTypeProvider<JsonSchemaToTsProvider>()

    fastify.route({
        method: 'post',
        url: '/agents/:agent/workers',

        schema: {
            summary: 'Create a worker instance for an agent',
            body: {
                type: 'object',
                properties: {
                    input: {
                        type: 'object',
                        description: 'The input data to the worker'
                    }
                }
            }
        },
        async handler(request, reply) {
            const {agent} = request.params as { agent: string };
            const {input} = request.body as { input: object };
            const worker = await fastify.worker.create(agent, input);
            reply.type('application/json');
            return reply.send(worker);
        }
    })
}
