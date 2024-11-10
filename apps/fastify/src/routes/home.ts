import {FastifyPluginAsyncZod} from "fastify-type-provider-zod";

const routes: FastifyPluginAsyncZod = async function (fastify) {
  // const routes= Object.entries( fastify.swagger({yaml:false}).paths!)
  //      .filter(([path, pathItem]) =>     pathItem.get  && pathItem.schema.produces?.includes('text/event-stream'))
  //      .map(([path, pathItem]) => path)
     
    const routes= ['thought/text/stream','thought/object/stream','dynamic-docs']
       
    fastify.route({
        url: '/home',
        method: 'GET',
        async handler(request, reply) {
            reply.header('Content-Type', 'text/html');
            reply.send(`<html>
                    <head>
                         <script src="https://unpkg.com/htmx.org@2.0.2"></script>
                        <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
                        <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
                    </head>
                    <body>  
                    <div class="bg-white"> 
                         <header class="bg-slate-100 sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-10 border-b border-gray-200    py-2  px-4  sm:px-6 lg:px-8  h-auto leading-6 flex flex-wrap">
                          <div class="flex container justify-center gap-6	divide-x   ">
                            <div hx-preserve="true" id="loader" class="group rounded-full text-sm  text-gray-600 ring-1 ring-gray-900/10 hover:ring-gray-900/20 text-center mx-65	my-6 px-2	  ">
                              Stream Events From   <input type='text' name="url"  placeholder='Enter URL to stream'  value="dynamic-docs" autocomplete="stream" list="api-list" class='focus:ring-blue-600 bg-transparent group-focus:ring-blue-600 group-hover:ring-1  group-hover:ring-gray-900/20 m-2 shadow-lg border-0'>                   
                              <button hx-get='/sse'  hx-include="[name='url']" hx-trigger='click' hx-target='#sse-proxy'  class="border-0 font-semibold text-indigo-600"><span aria-hidden="true"></span>Go <span aria-hidden="true">&rarr;</span></button>
                               <datalist id="api-list">
                                      ${routes.map(route=>`<option value="${route}">`).join('')}
                                </datalist>
                            </div>
                             <a href="/reference" class="animate-pulse mx-6 p-6 my-2 text-blue-500 hover:text-blue-400 text-2xl"  target="_blank" rel="noopener noreferrer"> API References</a>
                                  
                            </div>
                            
                           </header> 

   <div class="relative isolate px-6   ">
            <div class="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" >
              <div class="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style="clip-path: polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)"></div>
            </div> 
    </div>
   <div id="sse-proxy" class="flex flex-wrap shadow-md p-80 h-full	text-wrap overflow-wrap max-w-screen break-normal justify-center justify-items-center text-prettytruncate hover:text-clip overflow-y-scroll"  >
         <div hx-select-oob="true" />
    </div>  
    <div class="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]" aria-hidden="true">
      <div class="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]" style="clip-path: polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)"></div>
    </div>
  </div>
 </body>
 </html> `
            )
        }

    })
}

export default routes;