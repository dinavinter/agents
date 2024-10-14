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



      fastify.get('/ide', async function handler(request, reply) {
                const platform = request.headers['user-agent'] || ''
                 reply.header('Cache-Control', 'no-store');  
                reply.type('text/html')
          const ctx = {}

          const html =await renderToString(await createApp(),ctx)
                return reply.send(`
                        <!DOCTYPE html>
                        <html>
                         <head>
                            <title>Vue SSR Example</title>
                            <script type="importmap">
                              {
                                "imports": {
                                  "vue": "https://unpkg.com/vue@3/dist/vue.esm-browser.js"
                                }
                              }
                            </script>
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
                            <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>

                          </head>
                          <body>
                            <div class="grid">
                                    <div></div>
                                    <div class="gutter-col gutter-col-1"></div>
                                    <div></div>
                                </div>

                            <div id="app">${html}</div>

                          </body>
                        </html>
                        `)
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

