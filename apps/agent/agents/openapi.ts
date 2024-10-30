//NOTE: works with assistant api of azure ai, won't work with sap ai
//NOTE: requires env.ASSISTANT_ID to be set

import {type ActorSystem, assign, ErrorActorEvent, fromPromise, setup} from "xstate";
import {fromEventAsyncGenerator} from "../stream";
import {ThreadCreateParams} from "openai/src/resources/beta/threads/threads";
import {IndexByProp} from "xstate/dist/declarations/src/types";
import {render, renderTo} from "./agent-render";
import {type AssistantStreamEvent} from "openai/resources/beta";
import {azureOpenAI} from "../ai";
  

export type AssistantStreamEventMap =   IndexByProp<AssistantStreamEvent, "event">
type ThreadMessageCompleted = AssistantStreamEventMap["thread.message.completed"];

 
type AssistantEmittedEventObject =  {type:"text-delta", event: string, data: string} | {type: "image-url", event: string, data: string}

const assistantsClient = azureOpenAI()
export const machine =  setup({
    types:{
        // events:{} as  AssistantEventObject | {message: string, type: 'message'},
        context:{} as {
            createParams: Partial<ThreadCreateParams>;
            thread: string ;
            message: string;
            messages: Partial<ThreadMessageCompleted["data"]>[];
            assistant: string;
        }
    },
    actors:{
        setupAssistant: fromPromise( async ():Promise<string> => {
            try {
                const assistantResponse = await assistantsClient.beta.assistants.create({
                    model: "GPT-4o", // replace with model deployment name
                    name: "tester",
                    instructions: "Your task is to generate an open api specs by the user request, search for in the file store for requests, responses and extract an api spec",
                    tools: [{"type":"file_search"}],
                    tool_resources: {"file_search":{"vector_store_ids":["vs_YKZYYep26NbuaDzK98ZV9evu"]}},
                    temperature: 1,
                    top_p: 1
                });
                console.log(`Assistant created: ${JSON.stringify(assistantResponse)}`);

                return assistantResponse.id!;
            } catch (error:any) {
                console.error(`Error creating assistant: ${error.message}`);

                throw error;
            }
        }),
        createThread:  fromPromise<string, Partial<ThreadCreateParams >>(async ({input }) => {
            const threadId = await assistantsClient.beta.threads.create(input);
            return threadId.id;
        }),
        sendMessage: fromPromise(async ({input:{thread, message}}:{input: {thread:string,message:string }} ) => {
            const messageId = await assistantsClient.beta.threads.messages.create(thread, {
                role: 'user',
                content: message,
            });
            return messageId.id;
        }), 
        streamThread: fromEventAsyncGenerator(async function * ({input:{thread, assistant_id}, system, emit}:{input: {thread:string,assistant_id:string}, system: ActorSystem<any>, emit: (emitted: AssistantEmittedEventObject) => void}) {
            const stream = assistantsClient.beta.threads.runs.stream(thread, {
                assistant_id: assistant_id
            });
            for await (const {event, data, ...part} of stream) {
                yield {
                    ...data,
                    type: event
                }
                if(event === 'thread.message.delta') {
                    if(data.delta.content) {
                        for (const delta of data.delta.content) {
                            if (delta.type === 'text') {
                                emit({type: 'text-delta', event: `@${data.id}.text-delta`, data: delta.text!.value!})
                                yield {type: 'text-delta', event: `text-delta`, data: delta.text!.value! , id: data.id}
                            }
                            if (delta.type === 'image_url') {
                                emit({type: 'image-url', event: `@${data.id}.image-url`, data: delta.image_url!.url!})
                            }
                            if (delta.type === 'image_file') {
                                emit({
                                    type: 'image-url',
                                    event: `@${data.id}.image_file`,
                                    data: delta.image_file!.file_id!
                                })
                            }
                        }
                    }
                }


                if (event === 'thread.run.requires_action' && data?.required_action?.type === 'submit_tool_outputs') {
                    const tool_outputs = data.required_action.submit_tool_outputs.tool_calls.map((toolCall: any) => {
                        return system.get(toolCall.function.name)?.send(JSON.parse(toolCall.function.arguments));
                    });

                    assistantsClient.beta.threads.runs.submitToolOutputsStream(
                        thread,
                        data?.id,
                        {tool_outputs},
                    )
                }

            }
        })
    }
}).createMachine({
    context: {
        createParams: {},
        thread: "",
        message: "",
        messages: [],
        assistant: "asst_ctJUZWK1aSZFFxUqaSLidXnn"
    },
    entry: render(({html}) => {
        return html`
                    <main class="mx-auto  bg-slate-50 h-full">
                        <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                            Assistant
                        </header>
                        <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse"
                             sse-swap="setup" hx-swap="innerHTML" />
                             
                    </main>`
    }),
    initial: 'setup',
    states: {
        setup: { 
            entry: renderTo('setup', ({html}) =>
                  html`<span>Setting up assistant</span>`
            ),
                  
            invoke: {
                entity: 'setupAssistant',
                src: 'setupAssistant',
                onDone: {
                    target: 'init',
                    actions: assign({
                        assistant: ({event: {output}}) => output
                    })
                },
                onError: {
                    target: 'setup',
                    actions: renderTo('content', ({html, event}) => {
                        return html`<pre class="text-lg text-red-900 inline text-wrap">
                                       <span>${JSON.stringify(event.error)}</span>
                                    </pre>`
                    })
                }
            }
        },
        init: { 
            entry: renderTo('setup', ({html, context:{assistant}}) =>
                html`<div class="flex flex-col items-center justify-center *:w-full w-full *:justify-center" hx-ext="sse"
                          sse-swap="content" hx-swap="beforeend" >
                    <pre>Assistant ID : <span class="inline" contenteditable="true">${assistant}</span> </pre>
                </div>`
            ),
            invoke: {
                src: 'createThread',
                input: ({context: {createParams}}) => ({
                    ...createParams
                }),
                onDone: {
                    target: 'thread',
                    actions: assign({
                        thread: ({event: {output}}) => output
                    })
                },
                onError: {
                    target: 'error',
                    entry: renderTo('content', ({html, event}) => {
                        return html`<pre class="text-lg text-red-900 inline text-wrap">
                                        ${(event as ErrorActorEvent).error}
                                    </pre> `
                    })
                }
            }
        },

        thread: {
            entry: renderTo('content', ({html, context, stream}) => {
                return html`
                    <div class="flex items start gap-2.5  p-2 m-2 w-full">
                        <img class="w-12 h-12 rounded-full"
                             src="https://flowbite.com/docs/images/people/profile-picture-5.jpg" alt="User Avatar"/>
                        <div class="flex flex-col gap-1 w-full ">
                            <div class="flex items center space-x-2 rtl:space-x-reverse">
                                <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">User</span>
                                <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                            </div>
                            <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow " >
                                <form>
                                   <input type="text" autocomplete="true" list="api-message" class="w-full p-2 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow " name="message" placeholder="Type a message"   />
                                   <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" hx-post="${stream.href}/events/message" hx-swap="outerHTML"  >Send</button>
                                </form>
                                <datalist id="api-message">
                                    <option value="Login with password registration"/>
                                    <option value="Login with social registration"/>
                                    <option value="Login with password and captcha"/>
                                </datalist>
                            </div> 
                        </div>
                    </div>`
            }),
            on: {
                'message': {
                    target: 'message',
                    actions: assign({
                        message: ({event: {message}}) => message
                    })
                }
            }
        },
        message: {
            invoke: {
                src: 'sendMessage',
                input: ({context: {thread, message}}) => ({
                    thread,
                    message: message
                }),
                onDone: {
                    target: 'stream',
                    actions: assign({
                        message: ({event: {output}}) => output
                    })
                },
                onError: {
                    target: 'thread',
                    entry: renderTo('content', ({html, event}) =>
                        html`<pre class="text-lg text-red-900 inline text-wrap" >
                                        ${(event as ErrorActorEvent).error}
                            </pre>`
                    )
                }
            }
        },
        stream: {
            entry: renderTo('content', ({html, context: {message}}) => {
                return html`
                    <div class="flex items start gap-2.5  p-2 m-2 w-full">
                        <img class="w-12 h-12 rounded-full"
                             src="https://flowbite.com/docs/images/people/profile-picture-1.jpg" alt="Assistant Avatar"/>
                        <div class="flex flex-col gap-1 w-full ">
                            <div class="flex items center space-x-2 rtl:space-x-reverse">
                                <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">Assistant</span>
                                <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                            </div>
                            <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow " hx-ext="sse"
                                 sse-swap="messages">
                               
                            </div>
                            
                        </div>
                    </div>
                `
            }),
            invoke: {
                src: 'streamThread',
                input: ({context: {thread,assistant}}) => ({
                    thread: thread,
                    assistant_id: assistant
                }),
                id: 'assistant',
                onDone: 'thread'
            },
            on: {
                ["thread.message.completed"]: {
                    actions: assign({
                        messages: ({
                                       context: {messages},
                                       event: {type, ...event}
                                   }) => [...messages, event as ThreadMessageCompleted["data"]]
                    })
                },
                ["thread.message.created"]: {
                    actions: renderTo('messages', ({html, event}) =>
                        html`<pre class="text-pretty language-csharp" contenteditable><code class="font-mono text-slate-900 inline text-wrap" hx-ext="sse" sse-swap=${`@${event.id}.text-delta`} /> </pre>`
                    )
                } 
            }

        },
        error: {}

    }
})

  