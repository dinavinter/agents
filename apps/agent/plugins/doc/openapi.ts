import {FastifyPluginAsync} from "fastify";
import fastifySwagger from "@fastify/swagger";
import {jsonSchemaTransform} from "fastify-type-provider-zod";
import fp from "fastify-plugin";

const openapi: FastifyPluginAsync<any> = async function (fastify) {
   
    //swagger
    await fastify.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'AI SDK + SAP AI + Fastify',
                description: 'API documentation for AI SDK + SAP AI + Fastify',
                version: '1.0.0',
            },
            servers: [],
        },
        mode: 'dynamic',
        transform: jsonSchemaTransform,


    });

    //@scalar/fastify-api-reference
    await fastify.register(import('@scalar/fastify-api-reference'), {
        routePrefix: '/reference',
        configuration: {

            spec: {
                content: () => fastify.swagger(),
            },
        },
    })
 
}

export default fp(openapi);
