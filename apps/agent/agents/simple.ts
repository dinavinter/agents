import 'atomico/ssr/load';

import {
    setup,
    createActor,
    assign,
    EventObject,
    enqueueActions,
    emit,
    AnyEventObject, ActionArgs, Action
} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {html} from "atomico";
import {Doodle} from "../doodles";
import {
    fromGenerateObject,
    fromAIEventStream
} from "../utils/toolStream";
import {findDoodleTool} from "../doodles/embedded";
import {
    render,
    renderCallbackActor, RenderStream,
    streamOptions
} from "../ui/render";
import {TextStreamPart} from "ai";

config();




export const machine = setup({
 
    actors: {
        agent: fromGenerateObject(),
        aiStream: fromAIEventStream({
            model: openaiGP4o(),
            temperature: 0.9
        }), 
        renderer: undefined as unknown as renderCallbackActor,
    },
    types: {
        events: {} as TextStreamPart<{doodle:typeof findDoodleTool}>,//EventFrom<typeof fromAIEventStream>,
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
    states: { 
        thinking: {
            entry: render( ({stream}) => html`
                    <div>
                        <pre>User: Think about a random topic, and then share that thought.</pre>
                        <pre>Agent:</pre>
                        <${stream?.event('thought').textStream} />
                    </div>`
            ),
            invoke: {
                src: 'aiStream',
                input: 'Think about a random topic, and then share that thought.',
                onDone: {
                    target: 'doodle'
                } 
            },
            on: {  
                'text-delta': {
                    actions: [
                        assign({
                            thought: ({context: {thought}, event: {textDelta}}) => thought + textDelta
                        }),
                        emit(  ({event: {textDelta}}) => ({
                            type:'thought',
                            data: textDelta
                        }))
                    ]
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
            on:{
                'tool-result' :{
                    actions:  render(({event: {result:{src,alt}}}) => {
                        return html`
                            <c-svg src="${src}" alt="${alt}"/>`
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
    //log stack trace
    console.log(new Error().stack)
    return actor;

}

export default create

// keep the process alive by invoking a promise that never resolves


//<!--        <dotlottie-wc src="https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie" autoplay loop></dotlottie-wc>-->
