import { z } from 'zod';
import {createActor, emit, log, PromiseActorLogic, setup} from 'xstate';
import { createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../providers/openai.js";
 import {render} from "../ui/stream";
import {SVG} from "../ui/components/svg";
 
const agent = createAgent({
    name: 'support-agent',
    model:  openaiGP4o(),
     events: {
        'agent.respond': z.object({
            response: z.string().describe('The response from the agent'),
        }),
        'agent.frontline.classify': z.object({
            category: z
                .enum(['billing', 'technical', 'other'])
                .describe('The category of the customer issue'),
        }),
        'agent.refund': z
            .object({
                response: z.string().describe('The response from the agent'),
            })
            .describe('The agent wants to refund the user'),
        'agent.technical.solve': z.object({
            solution: z
                .string()
                .describe('The solution provided by the technical agent'),
        }),
        'agent.endConversation': z
            .object({
                response: z.string().describe('The response from the agent'),
            })
            .describe('The agent ends the conversation'),
    },
});


const machine = setup({
    types: {
        events: agent.types.events,
        input: {} as string,
        context: {} as {
            customerIssue: string;
        },
    },
        actors: { agent: fromDecision(agent)  },
}).createMachine({
    initial: 'frontline',
    context: ({ input }) => ({
        customerIssue: input,
    }),
    entry: render(({html,context:{customerIssue}}) => html`
        <header slot="template" style="float: left; position: fixed; top: 0; left: 0; ">
                <h1 >Customer Support:</h1>
                <pre style="word-wrap: normal;"><p>${customerIssue}</p></pre>
        </header>`
    ),

    states: {
        frontline: {  
            entry:render(({html,stream}) => html`
                <div  slot="template">
                    <h2>Frontline</h2>
x                   <pre><${stream.event("classify").text} /></pre>
                </div>
                `
            ),
            invoke: {
                src: 'agent',
                input: ({ context }) => ({
                    context,
                    system: `You are frontline support staff for LangCorp, a company that sells computers.
          Be concise in your responses.
          You can chat with customers and help them with basic questions, but if the customer is having a billing or technical problem,
          do not try to answer the question directly or gather information.
          Instead, immediately transfer them to the billing or technical team by asking the user to hold for a moment.
          Otherwise, just respond conversationally.`,
                    goal: `The previous conversation is an interaction between a customer support representative and a user.
          Classify whether the representative is routing the user to a billing or technical team, or whether they are just responding conversationally.`, 
                })  
            } 
           ,
            on: { 
                'agent.frontline.classify': [
                    {
                        actions: emit( {type: 'classify', data: 'direct customer to billing'}),
                        guard: ({ event }) => event.category === 'billing',
                        target: 'billing',
                    },
                    {
                        actions:  emit( {type: 'classify', data: 'direct customer to technical support.'}),
                        guard: ({ event }) => event.category === 'technical',
                        target: 'technical',
                    },
                    {
                        actions:  emit( {type: 'classify', data: 'respond conversationally'}),
                        target: 'conversational',
                    },
                ],
            },
        },
        billing: {
            entry: render(({html,stream}) => html`
                <div slot="template">
                        <h2>Billing</h2>
                         <pre><${stream.event("refund").text} /></pre>
                         <slot name="refunding"></slot>
                    </div>
                `
            ),
            invoke: {
                src: 'agent',
                input: {
                    system:
                        'Your job is to detect whether a billing support representative wants to refund the user.',
                    goal: `The following text is a response from a customer support representative. Extract whether they want to refund the user or not.`,
                },
            }, 
             on: {
                'agent.refund': {
                    actions: emit(({event:{response}})=> ({type: 'refund', data: response})),
                    target: 'refund',
                },
            },
        },
        technical: {
            entry: render(({html }) => html`
                <div slot="template">
                        <h2>Technical</h2>
                        <p>Let's solve the technical issue.</p>
                        <slot name="technical.solve"></slot>
                    </div>
                `
            ),
            invoke: {
                src: 'agent',
                input: {
                    context: true,
                    system: `You are an expert at diagnosing technical computer issues. You work for a company called LangCorp that sells computers. Help the user to the best of your ability, but be concise in your responses.`,
                    goal: 'Solve the customer issue.',
                },
            } ,
            on: {
                'agent.technical.solve': {
                    actions: render(({html, event}) => html`<pre slot="technical.solve">${event.solution}</pre>`),
                    target: 'conversational',
                },
            },
        },
        conversational: {
            entry: render(({html,stream }) => html`
                <div slot="template">
                        <h2>Conversational</h2>
                         <slot name="response"></slot>
                    </div>
                `
            ),
            invoke: {
                src: 'agent',
                input: {
                    goal: 'You are a customer support agent that is ending the conversation with the customer. Respond politely and thank them for their time.',
                },
            },
            on: {
                 'agent.endConversation': {
                    actions: render(({html, event}) => html`<pre slot="response">${event.response}</pre>`),
                    target: 'end',
                },
            },
        },
        refund: {
            entry: render(({html }) => html`
                <div slot="refunding" style="height: 5rem; display: flex; flex-wrap: wrap;">
                    <h2>Refund</h2>
                    <${SVG} style="height: 3rem;width: 3rem; display: inline; object-fit: contain" src="https://raw.githubusercontent.com/MariaLetta/mega-doodles-pack/master/doodles/svg/doodle-106.svg"/>
                </div>
                `
            ),
            after: {
                1000: { target: 'conversational' },
            },
        },
        end: {
            entry: render(({html}) => html`
                <h1 slot="template" >The End</h1>
            `), 
            
            type: 'final',
            
        },
    },
});

 
export function create( create?: typeof createActor<typeof machine>) {
    return (create ?? createActor)(machine,{
        input: `I've changed my mind and I want a refund for order #182818!`,
    })
}
export default create
 