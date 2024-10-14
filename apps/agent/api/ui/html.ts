import {FastifyReply} from "fastify";
import {VNodeAny} from "atomico/types/vnode";
import {UserFetch} from "./components/stream-template";
import {html} from "atomico";


export type replyWithHtml = (reply:FastifyReply) => Promise<void>;

export function sendHtml(reply:FastifyReply,  node?:VNodeAny | string , scripts?:{src:string,type:string, async:boolean}[] ) {
    reply.header('Cache-Control', 'no-store'); 
    reply.type('text/html')
    reply.send(layout({
        body: typeof node  =="string"? node : `${node?.render() || ''}`, 
        scripts : scripts || []
    }));
}



export const layout = ({body, scripts}:{body?:string, scripts:{src:string,type:string, async:boolean}[]}) => `
<html>
      <head>
        <title>Agent AI</title>
         <script type="importmap">
        {
          "imports": {
            "vue": "https://cdn.jsdelivr.net/npm/@vue/runtime-dom@3.5.12/dist/runtime-dom.esm-browser.js",
            "vuetify": "https://cdn.jsdelivr.net/npm/vuetify@3.7.2/dist/vuetify-labs.esm.js",

            "vue/server-renderer": "https://cdn.jsdelivr.net/npm/@vue/server-renderer@3.5.12/dist/server-renderer.esm-browser.js",
            "atomico": "https://unpkg.com/atomico",
            "animejs":"https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
            "@atomico/hooks":"https://esm.sh/@atomico/hooks",
            "@atomico/hooks/use-slot":"https://esm.sh/@atomico/hooks@4.4.1/use-slot",
            "it-pushable":"https://esm.sh/it-pushable",
            "@atomico/store":"https://esm.sh/@atomico/store",
             "atomico/": "https://esm.sh/atomico/",
            "@atomico/": "https://esm.sh/@atomico/"

            
          }
        }
        </script> 
        <script src="/components/index.js" type="module"></script> 
        <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
         ${scripts.map(script => `<script src="${script.src}" type="${script.type}" ${script.async ? 'async' : ''}></script>`).join('\n')}
       </head>
       <body> 
             ${body || ''}  
         </body>
 </html>
`
