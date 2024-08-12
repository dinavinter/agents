import 'atomico/ssr/load';

import {
    setup,
    createActor, enqueueActions,
} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {Doodle,findDoodleTool} from "../ui/doodles";
 import {TextStreamPart} from "ai";
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
            thought?: string;
            doodle?: Doodle;
        },
        context: {} as {
            stream?: RenderStream,
            thought?: string;
            doodle?: Doodle;
        }
    }
}).createMachine({
    initial: 'thinking',
    context: ({input}) => input,
    entry: render(({html}) => html`
        <div slot="template">
            <pre ><h2>The task:</h2> Think about a random topic, and then share that thought.</pre>
            <pre ><h2>Agent:</h2></pre>
            <div><slot></slot></div>
        </div>`
    ),
    states: {
        thinking: {
            entry: render(({stream, html}) => html`
                <${stream?.event('thought').text}/>
            `),
            invoke: {
                src: 'aiStream',
                input: 'Think about a random topic, and then share that thought.',
                onDone: {
                    target: 'doodle'
                }
            },
            on: {
                'text-delta': {
                    actions: enqueueActions(({context: {thought}, event: {textDelta}, enqueue}) => {
                        enqueue.assign({
                            thought: thought + textDelta
                        })
                        enqueue.emit({
                            type: 'thought',
                            data: textDelta
                        })
                    })
                }
            }
        },
        doodle: {
            invoke: {
                src: 'aiStream',
                input: {
                    template: `search for a doodle that describes the thought {thought}`,
                    tools: {
                        doodle: findDoodleTool
                    }
                }
            },
            on: {
                'tool-result': {
                    actions: render(({event: {result: {src, alt}}, html}) => {
                        return html`
                            <${SVG} src="${src}" alt="${alt}" style="height: 50%; width: 50%; inset: -20%"/>`
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

 