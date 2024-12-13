import Fastify, {FastifyPluginAsync} from 'fastify'
import fp from "fastify-plugin";
import {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import './plugins/yjs';
import * as Y from "yjs";
const plugins:FastifyPluginAsync= fp(async function fastify( instance, opts){
    const fastify = instance.withTypeProvider<JsonSchemaToTsProvider>()

    await fastify.register(import('./plugins/log'))

    await fastify.register(import('./routes/home')) 
    // await fastify.register(import('./plugins/zod'))
    await fastify.register( import('./plugins/doc'))


    const doc = new Y.Doc({guid: "catalog", collectionid: "agents", gc: false, autoLoad: true})

    await fastify.register( import('./plugins/yjs/party'), {
        doc: doc
    })

    // await fastify.register( import('./plugins/agent/collection') , { doc: doc})
    await fastify.register( import('./plugins/agent/agent'))
    // await fastify.register( import('./plugins/agent/vm'))
    await fastify.register( import('./plugins/agent/repl'))
    await fastify.register( import('./plugins/agent/runtime'))



    //routes
    // await fastify.register(import('./routes/agent'))
    await fastify.register(import('./routes/config'))
    // await fastify.register(import('./routes/dom'))
    //
    //sse plugin & sse proxy 
    await fastify.register( import('./plugins/sse'))

    
    

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
