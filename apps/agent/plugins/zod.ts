import {FastifyPluginAsync} from "fastify";
import {serializerCompiler, validatorCompiler, ZodTypeProvider} from "fastify-type-provider-zod";
import fp from "fastify-plugin";

export const zod:FastifyPluginAsync= async function fastify( fastify, opts){
    fastify =fastify.withTypeProvider<ZodTypeProvider>();
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);
}

export default fp(zod);