import {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import fp from "fastify-plugin";

const docs: FastifyPluginAsyncZod<any> = async function (fastify) {
    await fastify.register(import('./openapi'));
    await fastify.register(import('./code'));
}

export default fp(docs);