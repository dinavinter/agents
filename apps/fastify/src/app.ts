import Fastify, {FastifyPluginAsync} from 'fastify'
import fp from "fastify-plugin";
import {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";


const plugins:FastifyPluginAsync= fp(async function fastify( instance, opts){
    const fastify = instance.withTypeProvider<JsonSchemaToTsProvider>()

    await fastify.register(import('./plugins/log'))

    await fastify.register(import('./routes/home')) 
    // await fastify.register(import('./plugins/zod'))
    await fastify.register( import('./plugins/doc'))

    //routes
    await fastify.register(import('./routes/agent'))
    await fastify.register(import('./routes/config'))
    // await fastify.register(import('./routes/dom'))
    //
    //sse plugin & sse proxy 
    await fastify.register( import('./plugins/sse'))
    
    await fastify.register( import('./plugins/xstate'))
    

    //redirect default route to /reference
    fastify.get('/', async function (request, reply) {
        reply.redirect('/reference')
    })
     
})



async function createFastify() {
    const fastify = Fastify({ logger: true });

    fastify.register(plugins, { prefix: '/' });
    
    return {
        fastify,
        async ready() {
            await fastify.ready();
        } 
    };
}

export  default plugins;
