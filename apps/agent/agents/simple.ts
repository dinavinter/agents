import 'atomico/ssr/load';

import {assign, createActor, emit, fromPromise, setup,} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {Doodle, findDoodleTool} from "../ui/doodles";
import {streamText, TextStreamPart} from "ai";
import {SVG} from "../ui/components/svg";
import {render, RenderEvent, RenderStream} from "../ui/stream";
import {fromAIEventStream} from "../utils/ai-stream";
 
config();

 
    


export const machine = setup({

    actors: {
        aiStream: fromAIEventStream({
            model: openaiGP4o(),
            temperature: 0.9
        })
     },
    types: {
        events: {} as TextStreamPart<{ doodle: typeof findDoodleTool }>,//EventFrom<typeof fromAIEventStream>,
        emitted: {} as {type: 'thought', data: string} | RenderEvent,
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
               <div slot="template">
                   <pre><h2>Thinker:</h2></pre>
                   <slot name="thought"></slot>
               </div> 
            `),
            invoke: {
                src: 'aiStream',
                id: 'thinker',
                input: 'Think about a random topic, and then share that thought.'
            },
            on:{
                'text-delta':{
                    actions:  render(({html,event: {textDelta}}) => html`
                        <soan slot="thought">${textDelta}</soan>
                    `)
                },
                'done':{
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
                </div>`
            ),
            invoke: {
                src: 'aiStream',
                input: {
                    template: `search for a doodle that describes the thought {thought}`,
                    tools: {
                        doodle: findDoodleTool
                    }
                },
                onDone:'done'
            },
            on: {
                'tool-result': {
                    actions: render(({event: {result: {src, alt}}, html}) => {
                        return html`
                            <${SVG} slot="doodle" src="${src}" alt="${alt}" style="height: 50%; width: 50%; inset: -20%"/>`
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

export function create(create?: typeof createActor<typeof machine>) {
    const actor = (create || createActor)(machine);
    console.log('create actor', actor.id)
    return actor;

}

export default create

 