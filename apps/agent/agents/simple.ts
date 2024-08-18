import 'atomico/ssr/load';

import {assign, createActor, log, setup,} from 'xstate';
 import {config} from 'dotenv';
import {Doodle, findDoodleTool} from "../ui/doodles";
import {SVG} from "../ui/components/svg";
import {fromAIEventStream, openaiGP4o} from "../ai";
import {render, RenderStream} from "../ui/render";
   
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
    entry: render(({html}) => html`
        <div slot="template">
            <pre ><h2>The task:</h2> Think about a random topic, and then share that thought.</pre>
            <div><slot></slot></div>
        </div>`
    ),
    states: {
        thinking: {
            entry: render(({stream, html}) => html`
                <div >
                    <pre ><h2>Thinker:</h2></pre>
                    <${stream.service("thinker").event("text-delta").text}  /> 
                    <slot </slot>
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
            entry: render(({html}) => html`
                <div slot="template">
                    <pre ><h2>Doodler:</h2></pre>
                    <p>Here is a doodle that describes the thought.</p>
                    <slot name="doodle"></slot>
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
                    actions: render(({event: {result: {src, alt}}, html}) => html`
                        <${SVG} slot="doodle" src="${src}" alt="${alt}" style="height: 50%; width: 50%; inset: -20%"/>
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

 

 