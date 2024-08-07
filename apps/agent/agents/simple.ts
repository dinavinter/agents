import { z } from 'zod';
import 'atomico/ssr/load';

import {setup, createActor, assign, sendTo, EventObject, spawnChild, enqueueActions} from 'xstate';
import {createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {html} from "atomico";
 import {Doodle} from "../doodles";
import {fromGenerateObject, fromToolStream,} from "../utils/toolStream";
import {findDoodleTool} from "../doodles/embedded";
import {renderActor, renderCallbackActor} from "../ui/render";
import {SVG} from "../ui/components/svg";
config();
 

export const machine = setup({
    actors: { agent: fromGenerateObject() , render: undefined as unknown as renderActor, renderer: undefined as unknown as renderCallbackActor, doodle: fromToolStream()},
    types: {
        context: {} as {
            thought?: string;
            doodle?: Doodle
        },
    },
}).createMachine({ 
    initial: 'thinking',
    invoke: {
        src: 'renderer',
        id: 'renderer',
        systemId: 'renderer',
    },  
    states: {
        thinking: {
            entry: sendTo('renderer', {
                type: 'render', 
                node: html`<host>
                    <span>I'm thinking about a random topic</span> 
                </host>`
            }),
            invoke: {
                src: 'agent',
                input: {
                    prompt: 'Think about a random topic, and then share that thought.',
                    model: openaiGP4o(),
                    schema: z.object({
                        text: z.string().describe('The text of the thought'),
                    }),
                    temperature: 0.9
                },
                onDone: {
                    target: 'doodle',
                    actions: assign({
                        thought: ({event: {output}}) => output.text
                    })
                },
            }
        },
        doodle: {
            invoke: {
                src: 'doodle',
                input: {
                    template: `search for a doodle that describes the thought {thought}`,
                    model: openaiGP4o(),
                    tools: {
                        doodle: findDoodleTool 
                    } 
                },
                onSnapshot: {
                    target: 'thought',
                    guard: ({event}) => event.snapshot.context?.type === 'doodle',
                    actions: enqueueActions(({enqueue,check,event})=> {
                            const doodle = event.snapshot.context; 
                            enqueue.assign({
                                doodle: event.snapshot.context
                            }) 
                            enqueue.sendTo('renderer', () => ({
                                type: 'render',
                                node: html`
                                    <host>
                                        <${SVG} src="${doodle?.src}" alt="${doodle?.alt}"/>
                                    </host>
                                `
                            }))
                        }),
                },
            },
        },
        thought: {
            entry: sendTo('renderer',  ({context:{thought,  doodle}}:{context:any}) =>({
                type: 'render', 
                node: html`
                       <host>
                           <span> Thought: ${thought} </span> 
                       </host>
                    ` 
            }) ) 
        }
    },
});
 
export function create( create?: typeof createActor<typeof machine>) {
    return (create ?? createActor)(machine)
}

export default create

// keep the process alive by invoking a promise that never resolves


//<!--        <dotlottie-wc src="https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie" autoplay loop></dotlottie-wc>-->
