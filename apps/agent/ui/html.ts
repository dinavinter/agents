import {FastifyReply} from "fastify";
import {VNodeAny} from "atomico/types/vnode";
import {UserFetch} from "./components/stream-template";
import {html} from "atomico";


export type replyWithHtml = (reply:FastifyReply) => Promise<void>;

export function sendHtml(reply:FastifyReply,  node:VNodeAny ) {
    reply.header('Cache-Control', 'no-store'); 
    reply.type('text/html')
    reply.send(layout(node));
}


export const layout = (node:VNodeAny) => `
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
       <script src="/ui/components/streamable.js" type="module"></script>
       <script  src="/ui/components/svg.js" type="module"> </script>
       <script  src="/ui/components/text.js" type="module"> </script>
       <script  src="/ui/components/json.js" type="module"> </script>
       <script  src="/ui/components/snapshot.js" type="module"> </script>

       <script  src="/ui/components/stream-template.js" type="module"> </script>

        <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>

       </head>
       <body> 
             ${node?.render() }  
         </body>
 </html>
`
 