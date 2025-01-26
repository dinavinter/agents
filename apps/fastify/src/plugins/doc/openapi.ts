import {FastifyPluginAsync} from "fastify";
import fastifySwagger from "@fastify/swagger";
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
        
        // transform: jsonSchemaTransform,
        
        

    });

    //@scalar/fastify-api-reference
    await fastify.register(import('@scalar/fastify-api-reference'), {
        routePrefix: '/reference',
        configuration: {
            
            spec: {
                description: 'API documentation Agents',
                
                content: () => {
                    try {
                        console.log('swagger', fastify.swagger());
                        return fastify.swagger();
                    }
                    catch (e) {
                        console.error(e);
                        return {};
                    }
                }
            },
        },
    })

    // fastify.get("openapi.json",  (request, reply) => {
    //     reply.header('Content-Type', 'application/json');
    //    return   reply.send(fastify.swagger());
    // })
    //
    // fastify.get("openapi",  (request, reply) => {
    //     reply.header('Content-Type', 'application/x-yaml');
    //     return   reply.send(fastify.swagger({yaml: true}));
    // })

}

export default fp(openapi);
