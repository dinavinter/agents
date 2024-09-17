import 'atomico/ssr/load';

import {assign, setup,} from 'xstate';
import {Doodle, findDoodleTool} from "../doodles";
import {SVG} from "../components";
import {fromAIEventStream, openaiGP4o} from "../ai";
import {render, RenderStream, renderTo} from "./agent-render";
import {ChatBubble} from "./components/chatBubble";
import {Header} from "./components/header";

 
    


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
            <${Header} title="The Wiser" />
           <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="content" hx-swap="beforeend" />
        </main>`
    ),
    states: {
        thinking: {
            entry: renderTo('content',({stream, html}) => html`
                <${ChatBubble} name="Thinker" 
                               img="https://flowbite.com/docs/images/people/profile-picture-5.jpg" 
                               swap="@thinker.text-delta" />
 
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
            entry: renderTo('content', ({html}) => html`
                <${ChatBubble} name="Doodler" 
                                img="https://flowbite.com/docs/images/people/profile-picture-3.jpg" 
                                swap="doodle"
                                Content="Searching for a doodle to describe my thought..." />
                
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

 

 