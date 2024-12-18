import 'https://esm.sh/atomico/ssr/load';
import 'yjs';

import {assign, emit, EventObject, setup,log, AnyEventObject} from "xstate";
 import {type EventMessage, fromAIEventStream} from "https://esm.sh/@cxai/stream";
import {ChatBubble} from "https://esm.sh/@cxai/stream@1.0.4/ui";
import type { LanguageModelV1} from "https://esm.sh/@ai-sdk/provider";
import {html} from "https://esm.sh/atomico@latest";
export type AIStream=ReturnType<typeof fromAIEventStream>;



export const machine = setup({
    actors: {
        //@ts-ignore Excessive stack depth comparing types 
        aiStream: undefined as unknown as AIStream
    },
     types: {
        emitted: {} as AnyEventObject,
        input: {} as {
            thought?: string ;
            model?: LanguageModelV1;
        },
        context: {} as {
            thought?:  string;
            topic?: string;
        }
    }
}).createMachine({
    id:"thinker",
    initial: 'topic',
    context: ({input}) => input,
    entry: emit({
        data: `<main class="mx-auto  bg-slate-50 h-full" >
                 <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                     The Wiser
                 </header>
                <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="content" hx-swap="beforeend" />
            </main>`,
        type: 'message',
        format: 'raw'
    }),
    
    states: {
        topic:{
            entry: emit({
                data: `<div  class="flex items-start gap-2.5  p-2 m-2 w-full">
                        <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow " >
                                <form >
                                   <input type="text" autocomplete="true" list="examples" class="w-full p-2 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow " name="topic" placeholder="What topic should I think of?"   />
                                   <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" hx-post="events/topic" hx-swap="outerHTML"  >Send</button>
                                </form>
                                <datalist id="examples">
                                    <option value="random topic"/>
                                    <option value="parties"/>
                                    <option value="songs"/>
                                </datalist>
                            </div>`,
                type: 'content',
                format: 'raw'
            }),
            on:{
                'topic':{
                    target: 'thinking',
                    actions: assign({
                        topic: ({event:{topic}}) => topic
                    })
                }
            }
        },
        thinking: {
            entry: emit({
                    data: `<div  class="flex items-start gap-2.5  p-2 m-2 w-full">
                                <img class="w-12 h-12 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-5.jpg" alt="Thinker" ></img>
                                <div class="flex flex-col gap-1 w-full">
                                    <div class="flex items center space-x-2 rtl:space-x-reverse">
                                        <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">Thinker</span>
                                        <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                                    </div>
                                    <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                                      <pre class="text-lg text-slate-900 inline text-wrap" sse-swap="@thinker.text-delta"> </pre>
                                    </div>
                                </div>
                            </div>`,
                    type: 'content',
                    format: 'raw'
                }
            ), 
            invoke: {
                src: 'aiStream',
                id: 'thinker',
                systemId: 'thinker',
                input: 'Think about {{topic}}, and then share that thought.' 
            },
            
      
            on:{
                'finish':{
                    actions: emit({
                        data: 'test-finish',
                        type: 'message'
                    }),
                },
                'output':{
                    target: 'done',
                    actions: assign( {
                        thought: ({  event: {output}}) => output
                    })
                }
            } 
        },
        done: { 
            type: 'final',
            output: ({context}) => context
        }
    },
});

 
export default machine;
 