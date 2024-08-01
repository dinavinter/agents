import { z } from 'zod';
import {setup, createActor, assign} from 'xstate';
import {createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
config();


const agent = createAgent({
    name: "simple-agent",
    model: openaiGP4o() ,
  
    events: {
        'agent.thought': z.object({
            text: z.string().describe('The text of the thought'),
        }),
    }
});

export const machine = setup({
    actors: { agent: fromDecision(agent) },
    
}).createMachine({
    initial: 'thinking',
    context: {
        thought: '',
    },
    states: {
        thinking: {
            invoke: {
                src: 'agent',
                input: 'Think about a random topic, and then share that thought.',
            },
            on: {
                'agent.thought': {
                    actions: assign({ thought:  ({ event }: {event:typeof agent.events}) =>event.text }),
                    target: 'thought',
                },
            },
        },
        thought: {
            type: 'final',
        },
    },
});

export function create( create?: typeof createActor<typeof machine>) {
    return (create ?? createActor)(machine)
}

export default create

// keep the process alive by invoking a promise that never resolves


