import {z} from 'zod';
import {createActor, emit, setup} from 'xstate';
import {createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../ai";
import {render, renderTo} from "./agent-render";
import {SVG} from "../components";
import {c, css, html} from "atomico";

const agent = createAgent({
    name: 'support-agent',
    model: openaiGP4o(),
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



export const machine = setup({
    types: {
        events: agent.types.events,
        input: {} as string,
        context: {} as {
            customerIssue: string;
        },
    },
    actors: {agent: fromDecision(agent)},
}).createMachine({
    initial: 'call',
    context: ({input}) => ({
        customerIssue: input ?? `I've changed my mind and I want a refund for order #182818!`,
    }),
    entry: render(({html, context: {customerIssue}, stream}) => html`
        <main class="mx-auto  bg-slate-50 h-screen w-screen">
            <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                Customer Support
            </header>
            <div class="flex flex-col items-center justify-center *:justify-center w-full *:w-2/3 " hx-ext="sse"  sse-swap="content" hx-swap="beforeend">
            </div>
        </main>
    `),

    states: {
        call: {
            entry: renderTo('content', ({html, context: {customerIssue}}) => html`
                <${ChatBubble} content=${customerIssue} 
                               name="Customer"
                               img="https://flowbite.com/docs/images/people/profile-picture-3.jpg"  />
                    
            `), 
            after: {
                50: 'frontline',
            }
        },
        frontline: {
            entry: renderTo('content', ({html, stream}) => html`
                <${ChatBubble} name="Frontline" swap="classify"
                               img="https://flowbite.com/docs/images/people/profile-picture-4.jpg"/>

            `),
            invoke: {
                src: 'agent',
                input: ({context}) => ({
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
                        actions: emit({type: 'classify', data: 'Directing customer to billing'}),
                        guard: ({event}) => event.category === 'billing',
                        target: 'billing',
                    },
                    {
                        actions: emit({type: 'classify', data: 'Directing customer to technical support.'}),
                        guard: ({event}) => event.category === 'technical',
                        target: 'technical',
                    },
                    {
                        actions: emit({type: 'classify', data: 'Respond conversationally'}),
                        target: 'conversational',
                    },
                ],
            },
        },
        billing: {
            entry: renderTo('content', ({html, stream}) => html`
                <${ChatBubble} name="Billing" swap="billing"
                               img="https://flowbite.com/docs/images/people/profile-picture-4.jpg"/> 
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
                    actions: emit(({event: {response}}) => ({type: 'billing', data: response})),
                    target: 'refund',
                },
            },
        },
        technical: {
            entry: renderTo('content', ({html,stream}) => html`
                <${ChatBubble} name="Technical" swap="technical.solve"
                               img="https://flowbite.com/docs/images/people/profile-picture-5.jpg"/>
                `
            ),
            invoke: {
                src: 'agent',
                input: {
                    context: true,
                    system: `You are an expert at diagnosing technical computer issues. You work for a company called LangCorp that sells computers. Help the user to the best of your ability, but be concise in your responses.`,
                    goal: 'Solve the customer issue.',
                },
            },
            on: {
                'agent.technical.solve': {
                    actions: renderTo('technical.solve', ({html, event}) => html`<p${event.solution}</p>`),
                    target: 'conversational',
                },
            },
        },
        conversational: {
            entry: renderTo('content', ({html, stream}) => html`
                <${ChatBubble} name="Conversational" swap="conversation"
                               img="https://flowbite.com/docs/images/people/profile-picture-1.jpg"/>
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
                    actions:  emit(({event: {response}}) => ({type: 'conversation', data: response})),  
                    target: 'end',
                },
            },
        },
        refund: {
            entry: renderTo('billing', ({html}) => html`
                <${SVG} class="inline-block w-1/2" src="https://raw.githubusercontent.com/MariaLetta/mega-doodles-pack/master/doodles/svg/doodle-106.svg"/>
           `),
            after: {
                1000: {target: 'conversational'},
            },
        },
        end: { 
            type: 'final',

        },
    },
});


const ChatBubble = c(({content, name, img, swap }) => {
    return html`<div class="flex items-start gap-2.5  p-2 m-2 w-full">
            <img class="w-12 h-12 rounded-full" src=${img} alt=${name} />
            <div class="flex flex-col gap-1 w-full">
                <div class="flex items center space-x-2 rtl:space-x-reverse">
                    <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">${name}</span>
                    <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                </div>
                <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                    <pre class="text-lg text-slate-900 inline text-wrap" sse-swap="${swap}">${content}</pre>
                </div>
            </div>
        </div>
    `;
},{
    props: {
        swap: {
            type: String,
            reflect: true
        },
        content: {
            type: String,
            reflect: true
        },
        name: {
            type: String,
            reflect: true
        },
        img: {
            type: String,
            reflect: true
        }
    },
    styles: css`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        @tailwind screens;
        
        :host {
            display: block;
            width: 100%;
        }
    `
});
customElements.define('chat-bubble', ChatBubble);
