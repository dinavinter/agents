import 'atomico/ssr/load';
import {FastifyInstance} from "fastify";
 import {layout, sendHtml} from "./ui/html";
import {html} from "atomico";
// import { createSSRApp, defineComponnet } from 'vue'
// import { renderToString } from 'vue/server-renderer'
const modKey = (platform:string)=> /Mac|iPod|iPhone|iPad/.test(platform) ? '⌘' : 'Ctrl'
import { Splitpanes, Pane } from 'splitpanes'
import { createSSRApp } from 'vue'
// Vue's server-rendering API is exposed under `vue/server-renderer`.
import { renderToString } from 'vue/server-renderer'
import fs from "node:fs";
import path from "node:path";
import {randomInt} from "node:crypto";
const app = createSSRApp({
    data: () => ({ count: 1 }),
    components: { Splitpanes, Pane },
    directives:{
        'mod-key': {
            mounted(el, binding) {
                el.textContent = modKey(binding.value)
            }
        }
    },
    
    template: `<splitpanes style="height: 400px">
      <pane min-size="20">1</pane>
      <pane>
        <splitpanes horizontal>
          <pane>2</pane>
          <pane>3</pane>
          <pane>4</pane>
        </splitpanes>
      </pane>
      <pane>5</pane>
      <style>
        .splitpanes__pane {
          display: flex;
          justify-content: center;
          align-items: center;
          font-family: Helvetica, Arial, sans-serif;
          color: rgba(255, 255, 255, 0.6);
          font-size: 5em;
        }

      </style>
    </splitpanes>`
})

renderToString(app).then((html) => {
    console.log(html)
})
 export  function createApp() {
     return createSSRApp({
         name: 'App',
        data: () => ({ count: 1 }),
        template: `<div @click="count++">{{ count }}</div>`,
    });
}

export function routes(fastify: FastifyInstance) {

      fastify.get('/ide/{agent} ', async function handler(request, reply) {
          reply.redirect(`/ide/${request.params.agent}/${randomInt(1, 100)}`)
        })

      fastify.get('/ide/{agent}/{workflow}', async function handler(request, reply) {
                 reply.header('Cache-Control', 'no-store');  
                reply.type('text/html')
          const {machine} = await import(`~/agents/${request.params.agent}`)
            const { agent, workflow } = request.params
                    return sendHtml(reply, ` 
                            <div class="grid">
                                    <div>
                                       <code>
                                          ${machine}
                                        </code>
                                    </div>
                                    <div class="gutter-col gutter-col-1"></div>
                                   <div hx-ext="sse" sse-connect="/${workflow}/${workflow}"   >
                                     <div  sse-swap="render" ext="sse" hx-swap="beforeend">
                                    </div>
                              <!--<div id="app">${html}</div> -->

                                </div>
                           <script type="module">
                            import Split from 'https://esm.sh/split-grid'

                                Split({
                                    columnGutters: [{
                                        track: 1,
                                        element: document.querySelector('.gutter-col-1'),
                                    }],
                                })

                            </script>
                            <style>
                            .grid {
                                    display: grid;
                                    grid-template-columns: 1fr 10px 1fr;
                                }
                                
                                .gutter-col {
                                    grid-row: 1/-1;
                                    cursor: col-resize;
                                }
                                
                                .gutter-col-1 {
                                    grid-column: 2;
                                }
                                </style>

 
                        `, 
                     [
                         "https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries",
                         "https://unpkg.com/vue@3/dist/vue.esm-browser.js"
                       ], {
                            agent,
                            workflow
                     })
                })

    fastify.get('/app.js', async function handler(request, reply) {
        reply.header('Cache-Control', 'no-store');
        reply.type('application/javascript')
        return reply.send(
            `import { createSSRApp } from 'vue'
                         ${createApp}
                         createApp().mount('#app')
                         `)
    })


    fastify.get('/initvuify.js', async function handler(request, reply) {
                return sendHtml(reply, `
                  <script type="module">
                    import { createApp } from 'vue'
                    import { createVuetify } from 'vuetify' 
                    const vuetify = createVuetify() 
                    const app = createApp({})
                    app.use(vuetify).mount('#app')  
                     
                  </script>
                `)
            })
        }

