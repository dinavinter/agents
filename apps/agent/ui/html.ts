import {FastifyReply} from "fastify";
import {VNodeAny} from "atomico/types/vnode";


export type replyWithHtml = (reply:FastifyReply) => Promise<void>;

export function sendHtml(reply:FastifyReply,  node:VNodeAny )
{
    reply.header('Cache-Control', 'no-store'); 
    reply.type('text/html')
    reply.send(`<html>
      <head>
        <base href="${reply.request.protocol}://${reply.request.hostname}${reply.request.originalUrl}" target="_blank" />
        <title>Agent AI</title>
         <script type="importmap">
        {
          "imports": {
            "atomico": "https://unpkg.com/atomico",
            "animejs":"https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
            "@atomico/hooks":"https://esm.sh/@atomico/hooks@4.4.1"
            
          }
        }
        </script> 
<!--         <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js" ></script>-->
       <script src="/ui/components/streamable.js" type="module"></script>
       <script  src="/ui/components/svg.js" type="module"> </script>
       <script  src="/ui/components/text.js" type="module"> </script>

       </head>
       <body>
           <style>
                body {
                     font-family: sans-serif;
                }
                #app {
                    display: block;
                    margin: 0 auto;
                    max-width: 800px;
                    padding: 20px;
                }
              </style>
           <div id="app">
                 ${node.render() } 
           </div>
         </body>
         </html>
`
    )
}