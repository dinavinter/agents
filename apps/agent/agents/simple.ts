import 'atomico/ssr/load';

import {setup, createActor, assign, sendTo, EventObject, spawnChild, enqueueActions, ActorRefFrom} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {html} from "atomico";
import {Doodle} from "../doodles";
import {fromGenerateObject, fromToolStream, fromTextStream, fromAiStreamText} from "../utils/toolStream";
import {findDoodleTool} from "../doodles/embedded";
import {render, renderActor, renderCallbackActor, RenderEvent, StreamActorLogic} from "../ui/render";
import {SVG} from "../ui/components/svg";
import {VNodeAny} from "atomico/types/vnode";
import {Streamable} from "../ui/components/streamable";
import {spawn} from "node:child_process";
import {TextStream} from "../ui/components/text";

config();


export const machine = setup({
    actors: {
        agent: fromGenerateObject(),
        aiStream: fromAiStreamText({
            model: openaiGP4o(),
            temperature: 0.9
        }),
        text: fromTextStream({
            model: openaiGP4o(),
            temperature: 0.9
        }),

        doodle: fromToolStream({
            model: openaiGP4o(),
            temperature: 0.9
        }),
        renderer: undefined as unknown as renderCallbackActor,
    },
    types: {
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
            entry: [ 
                sendTo('agent', {
                    type: 'render',
                    render(h,{service}) {
                        return h`<div> 
                                    <pre>User: Think about a random topic, and then share that thought.</pre>
                                    <pre>Agent:</pre> <${service('thought').textStream} /> 
                                 </div>`
                    }
                } satisfies RenderEvent)
            ],
            invoke: {
                src: 'text',
                systemId: 'thought',
                input: 'Think about a random topic, and then share that thought.',
                onSnapshot: {
                    actions: assign({
                        thought: ({context: {thought}, event:{snapshot: {context:delta}}}) => thought ? thought + delta : delta
                    })
                },
                onDone: {
                    target: 'doodle'
                }

            }
        },
        doodle: {
            invoke: {
                src: 'doodle',
                input: {
                    template: `search for a doodle that describes the thought {thought}`,
                    tools: {
                        doodle: findDoodleTool
                    }
                },
                onSnapshot: {
                    actions: sendTo('agent', (({event: {snapshot: {context: doodle}}}) => ({
                        type: 'render',
                        render(h) {
                            console.log('doodle render', doodle)
                            return h`<c-svg  src="${doodle?.src}"  alt="${doodle?.alt}"  />`
                        } 
                    } satisfies RenderEvent))),
                    guard: ({event: {snapshot: {context: doodle}}}) => doodle !== undefined
                },
                onDone: {
                    target: 'done'
                }
            },
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
