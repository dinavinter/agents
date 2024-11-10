import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {z} from "zod";
import type {FastifyPluginAsync, FastifyReply, FastifyRequest} from "fastify";
import FastifySSEPlugin, {type EventMessage} from "fastify-sse-v2";
import fp from "fastify-plugin";

/* 
   Plugin to allow to stream server sent events from clients who do not support it, like @scalar/api-reference
*  This will return a simple html page that will consume the server sent events
 */
const sseProxy: FastifyPluginAsync<{prefix?:string, condition: (req: FastifyRequest)=> boolean} > = async function (fastify, {prefix,condition}) {
    condition = condition || ((req) => !req.headers['accept']?.includes('text/event-stream') && req.headers['accept']?.includes('text/html')); 
    prefix = prefix ? `/${prefix}` : '/sse';
    
    await fastify.register(FastifySSEPlugin);


    fastify.addHook('preHandler', (req, reply, next) => {
        if (condition(req)) {
             reply.sse = async function (this: FastifyReply, source: AsyncIterable<EventMessage>) {
                this.type("text/html");
                this.header("cache-control", "no-cache,no-transform");
                return this.send(`<embed type="text/html"  src="${req.protocol}://${req.hostname}${prefix}?url=${req.url}" style="width:100%;height:100%;" />`)
            }
        }
        next()
    }) 

    fastify.route({
        url: prefix,
        method: 'GET',
        schema: {
            summary: "Proxy Server Sent Events",
            description: "This route will proxy server sent events from another server to the client",
            querystring: {
                required: ['url'],
                properties: {
                    url: {
                        type: 'string',
                        format: 'uri',
                        description: 'The url of the server sent events'
                    }
                    
                }
            },
            
            response: {
                200: {
                    description: 'HTML page that consumes the server sent events',
                    type: 'string',
                    
                }
            },
            produces: ['text/html']
        },
        async handler(request, reply) {
            const {url} = request.query;
            reply.type('text/html');
            return reply.send(`<html>
                    <head>
                         <script src="https://unpkg.com/htmx.org@2.0.2"></script>
                         <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
                        <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
                    </head>
                    <body>  
                         <div hx-ext="sse" sse-connect="${url}" sse-close="done" hx-ext="sse" sse-swap="message" hx-swap="beforeend" class="h-screen w-screen"/>
                    </body>
                    </html> `
            );

        }
    })
      
}
    
export default fp(sseProxy);