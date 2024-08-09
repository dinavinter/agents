import 'atomico/ssr/load';

import {
    setup,
    createActor,
    assign,
    sendTo,
    EventObject,
    spawnChild,
    enqueueActions,
    ActorRefFrom,
    ObservableActorLogic, PromiseActorLogic, fromObservable, fromCallback, EventFromLogic, EventFrom, emit
} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {html} from "atomico";
import {Doodle} from "../doodles";
import {
    fromGenerateObject,
    fromToolStream,
    fromTextStream,
    fromAiStreamText,
    fromAIEventStream
} from "../utils/toolStream";
import {findDoodleTool} from "../doodles/embedded";
import {render, renderActor, renderCallbackActor, RenderEvent, StreamActorLogic} from "../ui/render";
import {SVG} from "../ui/components/svg";
import {VNodeAny} from "atomico/types/vnode";
import {Streamable} from "../ui/components/streamable";
import {spawn} from "node:child_process";
import {TextStream} from "../ui/components/text";
import {TextStreamPart, Tool, ToolResultPart} from "ai";
import {EventMessage} from "fastify-sse-v2";

config();


// @ts-ignore
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
            thought?: string;
            doodle?: Doodle;
        },
        context: {} as {
            thought?: string;
            doodle?: Doodle;
        }
    }
}).createMachine({
    initial: 'thinking',
    context: ({input}) => input,
    entry:  spawnChild('renderer', {
        id: 'agent',
        syncSnapshot: false,
        input:{
            render(h,s) {
                return  h`<div> <${s('agent').htmlStream}  /></div>`
            } 
        }
    }),
    states: {
        thinking: {
            entry: sendTo('agent', {
                    type: 'render',
                    render(h,{event}) {
                        return h`<div> 
                                    <pre>User: Think about a random topic, and then share that thought.</pre>
                                    <pre>Agent:</pre> <${event('thought').textStream} /> 
                                 </div>`
                    }
                } satisfies RenderEvent), 
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
                }, 
                onDone: {
                    target: 'done'
                }
            },
            on:{
                'tool-result' :{
                    actions: sendTo('agent', ({event:{result:{src, alt}}})=> ({
                        type: 'render',
                        render(h) {
                            return h`<c-svg  src="${src}"  alt="${alt}"  />`
                        }
                    }) satisfies RenderEvent)
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
