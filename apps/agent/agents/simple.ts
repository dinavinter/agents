import 'atomico/ssr/load';

import {assign, createActor, log, setup,} from 'xstate';
 import {config} from 'dotenv';
import {Doodle, findDoodleTool} from "../ui/doodles";
import {SVG} from "../ui/components/svg";
import {fromAIEventStream, openaiGP4o} from "../ai";
import {render, RenderStream, renderTo} from "../ui/render";
   
config();

 
    


export const machine = setup({

    actors: {
        aiStream: fromAIEventStream({
            model: openaiGP4o(),
            temperature: 0.9
        })
     },
    types: {
        input: {} as {
            stream?: RenderStream,
            thought?: string ;
            doodle?: Doodle;
        },
        context: {} as {
            stream?: RenderStream,
            thought?:  string;
            doodle?: Doodle;
        }
    }
}).createMachine({
    initial: 'thinking',
    context: ({input}) => input,
    entry: render(({html, stream}) => html`
        <main class="mx-auto  bg-slate-50 h-full" >
        <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                The Wiser
         </header>
           <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="content" hx-swap="beforeend">
           </div>
                   
        </main>`
    ),
    states: {
        thinking: {
            entry: renderTo('content',({stream, html}) => html`
                <div class="flex items-start gap-2.5  p-2 m-2 w-full">
                <img class="w-12 h-12 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-5.jpg" alt="thinker avatar" />
                <div class="flex flex-col gap-1 w-full ">
                    <div class="flex items center space-x-2 rtl:space-x-reverse">
                        <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">Thinker</span>
                        <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                    </div>
                    <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                        <pre class="text-lg text-slate-900 inline text-wrap" sse-swap="@thinker.text-delta" />
                    </div>
                </div> 
                </div>
                `
            ), 
            invoke: {
                src: 'aiStream',
                id: 'thinker',
                systemId: 'thinker',
                input: 'Think about a random topic, and then share that thought.' 
            },
      
            on:{
                'output':{
                    target: 'doodle',
                    actions: assign( {
                        thought: ({  event: {output}}) => output
                    })
                }
            } 
        } , 
        doodle: {  
            entry: renderTo('content', ({html,stream}) => html`
                <div class="float-right flex items-start gap-2.5  p-2 m-2 w-full ">
                    <img class="w-12 h-12 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-3.jpg" alt="thinker avatar" />
                    <div class="flex flex-col gap-1 w-full  ">
                        <div class="flex items center space-x-2 rtl:space-x-reverse">
                            <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900  ">Doodler</span>
                            <span class="text-sm lg:text-lg font-normal text-gray-500  ">${new Date(Date.now()).toLocaleTimeString()}</span>
                        </div>
                        <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                            <pre class="text-lg text-slate-900 inline text-wrap " >
                               <div class="max-h-[90vh] shadow-sm" hx-ext="sse"  sse-swap="doodle" >
                                     Searching for a doodle to describe my thought...
                                </div>
                            </pre>
                        </div>
                    </div>
                </div> 
            `),
            invoke: {
                src: 'aiStream',
                input: {
                    template: `search for a doodle that describes the thought {{thought}}`,
                    tools: {
                        doodle: findDoodleTool
                    }
                },
                onDone:'done'
            },
            on: {
                'tool-result': {
                    actions: renderTo('doodle',({event: {result: {src, alt}}, html}) => html`
                        <div class="flex flex-grow flex-wrap ">
                            <span>Here is one!</span>
                            <${SVG} src="${src}" alt="${alt}" class="inline-flex  h-1/3 w-1/3  opacity-50   -translate-y-[10%] -mb-[20%] -mx-[7%] " />
                        </div>
                    `)
                }
            }
        },
        done: {
            type: 'final',
            output: ({context}) => context
        }
    },
});

 

 