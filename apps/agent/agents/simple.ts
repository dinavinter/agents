import { z } from 'zod';
import {setup, createActor, assign, sendTo} from 'xstate';
import {createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {renderActor, renderCallbackActor} from "../render";
import {html} from "atomico";
config();

 
const agent = createAgent({
    name: "simple-agent",
    model: openaiGP4o() ,
  
    events: {
        'agent.thought': z.object({
            text: z.string().describe('The text of the thought'),
        
                }) 
    }
});

export const machine = setup({
    actors: { agent: fromDecision(agent) , render: undefined as unknown as renderActor, renderer: undefined as unknown as renderCallbackActor},
    
}).createMachine({
    initial: 'thinking',
    invoke: {
        src: 'renderer',
        id: 'renderer',
        systemId: 'renderer',
    },
    context: {
        thought: '',
    },
    states: {
        thinking: {
            entry: sendTo('renderer', {
                type: 'render', 
                node: html`<host><span>I'm thinking about a random topic</span></host>`
            }),
            invoke: [{
                src: 'agent',
                input: 'Think about a random topic, and then share that thought.',
            }],
            on: {
                'agent.thought': {
                    actions: assign({ thought:  ({ event }: {event:typeof agent.events}) =>event.text }),
                    target: 'thought',
                },
            },
        },
        thought: {
            entry: sendTo('renderer',  ({context}) =>({
                type: 'render', 
                node: html`
                       <host><span> Thought: ${context.thought} </span></host>
                    `
            })) 
        }
    },
});

export function create( create?: typeof createActor<typeof machine>) {
    return (create ?? createActor)(machine)
}

export default create

// keep the process alive by invoking a promise that never resolves


