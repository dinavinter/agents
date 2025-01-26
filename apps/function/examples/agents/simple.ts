 
import {assign, emit, setup, AnyEventObject, UnknownActorLogic} from "https://esm.sh/xstate";
 import { fromAIEventStream,fromEventAsyncGenerator} from "https://esm.sh/@cxai/stream";

type Actors = {
    aiStream: ReturnType<typeof fromAIEventStream>
} & Record<string, UnknownActorLogic>


export const machine = setup({
    actors: {
        aiStream: fromEventAsyncGenerator( async function* () { 
                  yield  await new Promise((resolve) => setTimeout(resolve, 100));
                  yield {type: 'text-delta', data: 'Hello '}
            yield  await new Promise((resolve) => setTimeout(resolve, 50));

            yield {type: 'text-delta', data: 'World '}
            yield  await new Promise((resolve) => setTimeout(resolve, 50));

            yield {type: 'text-delta', data: '!' }
            yield  await new Promise((resolve) => setTimeout(resolve, 50));
            yield {type: 'output', data: 'Hello Word!' }
            
            yield {type: 'finish', data: 'finish' }
            
              
        })
    } as Actors,
     types: {
        emitted: {} as AnyEventObject,
        input: {} as {
            thought?: string ;
        },
        context: {} as {
            thought?:  string;
            topic?: string;
        }
    }
}).createMachine({
    id:"thinker",
    initial: 'thinking',
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
                input: 'Think about a random topic, and then share that thought.' 
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
 