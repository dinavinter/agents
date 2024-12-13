import 'atomico/ssr/load';

import {config} from 'dotenv';
 import {FastifyPluginAsync} from "fastify";
import fp from "fastify-plugin";
import {FastifySSEPlugin} from "fastify-sse-v2";
config();
     
   

const plugins:FastifyPluginAsync= fp(async function fastify( fastify, opts){
    await fastify.register(import('./plugins/zod'))

    // await fastify.register( import('./plugins/doc'))
    // await fastify.register( import('./plugins/static'))
    // await fastify.register( import('./plugins/auth'))
    await fastify.register(import('@fastify/formbody'))
    await fastify.register(FastifySSEPlugin);

    //routes
    await fastify.register(import('./api'))

    //sse plugin & sse proxy 
    // await fastify.register( import('./plugins/sse')) 
    await fastify.register(import('./plugins/log'))

    

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
export {createFastify}