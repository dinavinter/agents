import {FastifyReply} from "fastify";
import {VNodeAny} from "atomico/types/vnode";
import {UserFetch} from "./components/stream-template";
import {html} from "atomico";


export type replyWithHtml = (reply:FastifyReply) => Promise<void>;

export function sendHtml(reply:FastifyReply, agent:string, workflow:string ) {
    reply.header('Cache-Control', 'no-store'); 
    reply.type('text/html')
    reply.send(layout(agent,workflow));
}


export const layout = (agent:string, workflow:string) => `
<html>
      <head>
        <title>Agent AI</title>
         <script type="importmap">
        {
          "imports": {
            "atomico": "https://unpkg.com/atomico",
            "animejs":"https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
            "@atomico/hooks":"https://esm.sh/@atomico/hooks",
            "@atomico/hooks/use-slot":"https://esm.sh/@atomico/hooks@4.4.1/use-slot",
            "it-pushable":"https://esm.sh/it-pushable",
            "@atomico/store":"https://esm.sh/@atomico/store"
            
          }
        }
        </script> 
<!--         <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js" ></script>-->
<!--  <script type="module" src="https://cdn.jsdelivr.net/npm/zero-md@3?register"></script>-->

       <script src="https://unpkg.com/htmx.org@2.0.2"></script>
       <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
       <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>

       <script src="/ui/components/streamable.js" type="module"></script>
       <script  src="/ui/components/svg.js" type="module"> </script>
       <script  src="/ui/components/text.js" type="module"> </script>
       <script  src="/ui/components/json.js" type="module"> </script>
       <script  src="/ui/components/snapshot.js" type="module"> </script>
       <script  src="/ui/components/board.js" type="module"> </script>

       <script  src="/ui/components/stream-template.js" type="module"> </script>


       </head>
       <body> 
        <header class="bg-slate-50 ticky top-0 z-10 backdrop-filter backdrop-blur  border-b border-gray-200 items-start justify-start py-2 ">

           <div class="text-sm breadcrumbs *:hover:text-slate-500 *:text-gray-500 *:hover:shadow-sm"> 
              <a href="/agents"  ">agents</a> 
              <span class="mx-2 text-gray-500">/</span> 
              <a href="/agents/${agent}" >${agent}</a> 
              <span class="mx-2 text-gray-500">/</span> 
              <a href="#" class="text-slate-400 hover:text-slate-300">${workflow}</a> 
            </div>
        </header> 
            <div hx-ext="sse" sse-connect="${workflow}"   >
              <div  sse-swap="render" ext="sse" hx-swap="beforeend">
            </div>
 
         </body>
 </html>
`
 