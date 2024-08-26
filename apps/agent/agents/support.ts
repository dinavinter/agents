import {z} from 'zod';
import {createActor, emit, setup} from 'xstate';
import {createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../ai";
import {render, renderTo} from "../ui/render";
import {SVG} from "../ui/components/svg";

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
    // entry: render(({html, context: {customerIssue}, stream}) => html`
    //     <main class="mx-auto  bg-slate-50 h-screen">
    //         <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
    //             Customer Support
    //         </header>
    //         <div class="flex flex-col items-center justify-center *:w-2/3 *:justify-center *:shadow-md" hx-ext="sse"
    //              sse-swap="render" hx-swap="beforeend">
    //             <pre class="shadow-2xl  text-lg text-slate-900 p-2 m-2"><p>${customerIssue}</p></pre>
    //         </div>
    //     </main>
    // `),

    states: {
        call: {
            entry: render(({html, context: {customerIssue}, stream}) => html`
                <main class="mx-auto  bg-slate-50 h-full">
                    <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                        Customer Support
                    </header>
                    <div class="flex flex-col justify-evenly items-center  *:w-2/3 *:justify-center *:shadow-lg *:rounded-lg *:p-4 "
                         hx-ext="sse" sse-swap="content" hx-swap="beforeend">
                        <div>
                            <h2 class="text-2xl text-cyan-700 shadow-sm">Customer</h2> 
                            <pre class="shadow-2xl  text-lg text-slate-900 p-2 m-2"><p>${customerIssue}</p></pre>
                        </div>
                    </div>
                </main>
            `),
            after: {
                100: 'frontline',
            }
        },
        frontline: {
            entry: renderTo('content', ({html, stream}) => html`
                        <div  >
                            <h2 class="text-2xl text-cyan-700 shadow-sm">Frontline</h2> 
                            <pre class="shadow-2xl  text-lg text-slate-900 p-2 m-2"><${stream.event("classify").text}/></pre>
                        </div>
                `
            ),
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
                   <div >
                       <h2 class="text-2xl text-cyan-700 shadow-sm">Billing</h2>
                            <pre class="shadow-2xl  text-lg text-slate-900 p-2 m-2"><${stream.event("billing").text}/></pre>
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
                    actions: emit(({event: {response}}) => ({type: 'billing', data: response})),
                    target: 'refund',
                },
            },
        },
        technical: {
            entry: renderTo('content', ({html}) => html`
                        <div >
                            <h2 class="text-2xl text-cyan-700 shadow-sm"> Technical</h2>
                            <p class="shadow-2xl  text-lg text-slate-900 p-2 m-2">Let's solve the technical issue.</p>
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
            },
            on: {
                'agent.technical.solve': {
                    actions: renderTo('content', ({html, event}) => html`
                        <pre class="shadow-2xl  text-lg text-slate-900 p-2 m-2" slot="technical.solve">${event.solution}</pre>`),
                    target: 'conversational',
                },
            },
        },
        conversational: {
            entry: renderTo('content', ({html, stream}) => html`
                        <div  >
                            <h2 class="text-2xl text-cyan-700 shadow-sm">Conversational</h2>
                            <pre class="shadow-2xl  text-lg text-slate-900 p-2 m-2" > <${stream.event("conversation").text}/></pre>
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
                    actions:  emit(({event: {response}}) => ({type: 'conversation', data: response})),  
                    target: 'end',
                },
            },
        },
        refund: {
            entry: renderTo('content', ({html}) => html`
                        <div >
                            <h2 class="text-2xl text-cyan-700 shadow-sm">Refund</h2>
                            <div  style="height: 5rem; display: flex; flex-wrap: wrap;"> 
                                <${SVG} class="shadow-lg" style="height: 6rem;width: 6rem; display: inline; object-fit: contain"
                                        src="https://raw.githubusercontent.com/MariaLetta/mega-doodles-pack/master/doodles/svg/doodle-106.svg"/>
                            </div>
                        </div>
                `
            ),
            after: {
                1000: {target: 'conversational'},
            },
        },
        end: {
            entry: renderTo('content', ({html}) => html`
                <h1 class="text-4xl text-cyan-600 font-semibold">The End</h1>
            `),

            type: 'final',

        },
    },
});

 
  