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
            return reply.send(`<html xmlns="http://www.w3.org/1999/html">
              <head> 
                <title>Agent IDE: ${id}</title> 
                <script src="https://esm.sh/@cxai/ide"  type="module"></script> 
                </head>
                <body> 
                 <header   class="bg-slate-50 ticky top-0 z-10 backdrop-filter backdrop-blur  border-b border-gray-200 items-start justify-start py-2 ">
    
                   <div class="text-sm breadcrumbs *:hover:text-slate-500 *:text-gray-500 *:hover:shadow-sm"> 
                       <a href="#" class="text-slate-400 hover:text-slate-300">${id}</a> 
                      <span class="mx-2 text-gray-500">/</span> 
                      <a href="#" class="text-slate-400 hover:text-slate-300" >
                         <span  sse-swap="rev" hx-swap="innerHTML">
                                              
                        </span>
                       </a> 
                    </div>
                    
                </header>
                      <ts-editor value="import { createMachine } from 'xstate';"  url="${fastify.docs.url}" room="${id}"> 
        
                     </ts-editor>
                </body>
            `);
        }
    })


    fastify.get('/agents/:agent/playground', async function handler(request, reply: FastifyReply) {
        const {agent: id} = request.params as { agent: string };
        reply.header('Cache-Control', 'no-store');
        reply.type('text/html');

        reply.send(`<head>
                <title>Agent Playground: ${id}</title>
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