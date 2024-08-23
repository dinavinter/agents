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
        <main class="mx-auto  bg-slate-50" >
        <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                The Wiser
         </header>
           <div class="flex flex-col items-center justify-center *:w-2/3 *:justify-center" hx-ext="sse" sse-connect="${stream.href}/events" sse-swap="content" hx-swap="beforeend">
           </div>
                   
        </main>`
    ),
    states: {
        thinking: {
            entry: renderTo('content',({stream, html}) => html`
                <div class="mt-4 shadow-md mb-4 ">
                    <h2 class="text-xl font-semibold">Thinker</h2>
                    <${stream.service("thinker").event("text-delta").text}  />  
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
                <div class="mt-4  shadow-md mb-4 ">
                    <h2 class="text-xl font-semibold">Doodler:</h2>
                    <div class="mt-1  shadow-md  "> 
                        <pre>Searching for a doodle to describe my thought</pre>
                        <div class="max-h-[90vh] shadow-sm" hx-ext="sse" sse-connect="${stream.href}/events" sse-swap="doodle"
                             hx-swap="beforeend">
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
                        <div class="mt-2 flex flex-col justify-items-center max-h-full justify-center shadow-md">
                            <pre class="float-left">Here is one.</pre>
                            <${SVG} slot="doodle" src="${src}" alt="${alt}" class="" style="height: 50%; width: 50%; inset: -20%"/>
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

 

 