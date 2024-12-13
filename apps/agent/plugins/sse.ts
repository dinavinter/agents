import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {z} from "zod";
import type {FastifyReply, FastifyRequest} from "fastify";
import FastifySSEPlugin, {type EventMessage} from "fastify-sse-v2";
import fp from "fastify-plugin";

/* 
   Plugin to allow to stream server sent events from clients who do not support it, like @scalar/api-reference
*  This will return a simple html page that will consume the server sent events
 */
const sseProxy: FastifyPluginAsyncZod<{prefix?:string, condition: (req: FastifyRequest)=> boolean} > = async function (fastify, {prefix,condition}) {
    condition = condition || ((req) => !req.headers['accept']?.includes('text/event-stream'))
    prefix = prefix ? `/${prefix}` : '/sse';
    
    await fastify.register(FastifySSEPlugin);


    fastify.addHook('preHandler', (req, reply, next) => {
        if (condition(req)) {
            reply.sse = async function (this: FastifyReply, source: AsyncIterable<EventMessage>) {
                this.type("text/html");
                this.header("cache-control", "no-cache,no-transform");
                return this.send(`<embed type="text/html"  src="${req.hostname.startsWith("localhost")? req.protocol : "https"}://${req.hostname}${prefix}?url=${encodeURIComponent(req.url)}" style="width:100%;height:100%;" />`)
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
            querystring: z.object({
                url: z.string().describe('The url to proxy the server sent events from')
            }),
            
            response: {
                200: z.string().describe('HTML  page that consumes the server sent events')
            }
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