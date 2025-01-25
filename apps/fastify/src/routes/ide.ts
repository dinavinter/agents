import {FastifyInstance, FastifyReply} from "fastify";
import * as Y from "yjs";

export async function routes(fastify: FastifyInstance) {
    fastify.route({
        url: '/agents/:agent/ide',
        method: 'get',
        schema: {
            summary: 'Get an agent ide',

        },
        async handler(this, request, reply) {
            const {agent: id} = request.params as { agent: string };
            reply.type('text/html')
            return reply.send(`<!DOCTYPE html>
            <html >
              <head> 
                <title>Agent IDE: ${id}</title> 
               <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"> 
                <script src="https://esm.sh/@cxai/ide"  type="module"></script> 
               <script src="https://unpkg.com/htmx.org@2.0.2"></script>
               <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
               <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>

                </head>
                <body class="h-screen">  
                  <ts-editor value="import { createMachine } from 'xstate';"  url="${fastify.docs.url}" room="${id}"> 
    
                 </ts-editor> 
                    <div hx-ext="sse" sse-connect="rev"  sse-swap="rev+html"
                                                        hx-swap="outerHTML transition:true"  >
                    </div>
                </body>
                </html>`);
           
        }
    })


    fastify.get('/agents/:agent/playground', async function handler(request, reply: FastifyReply) {
        const {agent: id} = request.params as { agent: string };
        reply.header('Cache-Control', 'no-store');
        reply.type('text/html');

        reply.send(`<!DOCTYPE html>
                      <html>
                        <head>
                            <title>Agent Playground: ${id}</title>
                           <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
                           <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
                           <script src="https://unpkg.com/@spectrum-web-components/split-view/sp-split-view.js"></script>
                            <script  src="https://jspm.dev/@spectrum-web-components/bundle/elements.js" type="module" async></script> 
                           </head>
                          <body class="h-screen w-screen bg-gray-100"> 
                              <sp-split-view  horizontal resizable      > 
                                <div id="editor"  class="relative h-screen">
                                  <embed src="ide" class="w-full h-full">
                                </div>
                                <div id="runtime" class="h-screen" >
                                  <embed src="view" class="w-full h-full" />
                                </div>
                                 <script src="https://cdn.tailwindcss.com"></script> 
                                </sp-split-view>
                          </body>
                        </html>
        `);
    });
}


export default routes;