import Fastify, {FastifyPluginAsync} from 'fastify'
import fp from "fastify-plugin";
import {JsonSchemaToTsProvider} from "@fastify/type-provider-json-schema-to-ts";
import './plugins/yjs';
import * as Y from "yjs";
const plugins:FastifyPluginAsync= fp(async function fastify( instance, opts){
    const fastify = instance.withTypeProvider<JsonSchemaToTsProvider>()

    fastify.register(async (instance, opts) => {
        instance.addHook('onResponse', async (request, reply) => {
            reply.header('Access-Control-Allow-Origin', '*')
            reply.header('Access-Control-Allow-Methods', '*')
            reply.header('Access-Control-Allow-Headers', '*')
            reply.header('Access-Control-Allow-Credentials', 'true')
            reply.header('Access-Control-Max-Age', '86400')
            reply.header('Access-Control-Expose-Headers', '*')
        })
    });
    
    await fastify.register(import('./plugins/log'))
    await fastify.register(import('./plugins/doc/openapi'))

    await fastify.register(import('@fastify/formbody'))
    await fastify.register(import('./plugins/static'))

    //add error handler
    fastify.setErrorHandler((error, request, reply) => {
        console.error(error)
        reply.status(500).send({error: error.message})
    })
    
    //catch all errors
    // fastify.addHook('onError', async (request, reply, error) => {
    //     console.error(error)
    //     reply.send({error: error.message})
    // })
    
     // await fastify.register(import('./plugins/zod'))
 

    const doc = new Y.Doc({guid: "catalog", collectionid: "agents", autoLoad: true})

    await fastify.register( import('./plugins/yjs/hp'), {
        doc: doc
    })

    // fastify.addContentTypeParser('*', function (req, done) {
    //     var data = ''
    //     req.on('data', chunk => { data += chunk })
    //     req.on('end', () => {
    //         done(null, data)
    //     })
    // })



    // await fastify.register( import('./plugins/agent/collection') , { doc: doc})
    await fastify.register( import('./plugins/agent/agent'))
    // await fastify.register( import('./plugins/agent/vm'))
    await fastify.register( import('./plugins/agent/repl'))
    // await fastify.register( import('./plugins/agent/runtime'))



    //routes
    await fastify.register(import('./routes/agents'))
    await fastify.register(import('./routes/runtime'))
    await fastify.register(import('./routes/ide'))

    // await fastify.register(import('./routes/config'))
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
