import 'https://esm.sh/atomico/ssr/load';
import 'yjs';

import {assign, emit, EventObject, setup,log} from "xstate";
 import {type EventMessage, fromAIEventStream} from "https://esm.sh/@cxai/stream";
import  "https://esm.sh/@cxai/stream@1.0.4/ui";
import type { LanguageModelV1} from "https://esm.sh/@ai-sdk/provider";
import {html} from "https://esm.sh/atomico@latest";
export type AIStream=ReturnType<typeof fromAIEventStream>;

export const machine = setup({
    actors: {
        aiStream: undefined as unknown as AIStream
    },
     types: {
        emitted: {} as EventMessage & EventObject,
        input: {} as {
            thought?: string ;
            model?: LanguageModelV1;
        },
        context: {} as {
            thought?:  string;
        }
    }
}).createMachine({
    id:"thinker",
    initial: 'first',
    context: ({input}) => input,
    entry: emit({
        data: html`<main class="mx-auto  bg-slate-50 h-full" >
                tesxt
                <c-header title="The Wiser" />
                <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="content" hx-swap="beforeend" />
            </main>`.render(),
        event: 'content',
        type: 'EMIT'
    }),
    
    states: {
        first:{
            after:{
                '10' :{
                    target: "thinking",
                    actions:emit({
                        data:'test-first',
                        type: "EMIT"
                    })
                }
            }
        },
        thinking: {
            entry: emit({
                data: 'test-thinking',
                type: 'EMIT'
            }),
            // entry: emit({
            //         data: html`
            //             <chat-bubble name="Thinker"
            //                          img="https://flowbite.com/docs/images/people/profile-picture-5.jpg"
            //                          swap="@thinker.text-delta"/>
            //
            //         `,
            //         event: 'content',
            //         type: 'EMIT'
            //     }
            // ), 
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
                        type: 'EMIT'
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
            entry: emit({
                data: 'test-done',
                type: 'EMIT'
            }),
            type: 'final',
            output: ({context}) => context
        }
    },
});

 
export default machine;
 