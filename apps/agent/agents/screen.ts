import {assign, emit, setup} from "xstate";
import {fromAIElementStream, fromAIEventStream, openaiGP4o} from "../ai";
import {z} from "zod";
import {render, RenderStream, renderTo} from "./agent-render";
import {Doodle} from "../doodles";
import {ChatBubble} from "./components/chatBubble";

 

export const machine = setup({

    actors: {
        aiStream: fromAIEventStream({
            model: openaiGP4o(),
            temperature: 0.9
        }),
        aiElementStream: fromAIElementStream({
            model: openaiGP4o(),
            temperature: 0.9
        })
    },
    types: {
        input: {} as any,
        context: {} as {
            request?: string,
            draft?:   [] ;
            fields?: [];
            css?: [];
        }
    }
}).createMachine({
    initial: 'idle',
    context: ({input}) => {
        return {
            request: '',
            draft: [],
            fields: [],
            ...input
        }
    },
    entry: render(({html}) => html`
        <main class="mx-auto  bg-slate-50 h-full">
            <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                Screen Set Builder
            </header>
            <div class="flex flex-col items-center justify-center *:w-full w-full *:justify-center" 
                 hx-ext="sse"
                 sse-swap="content" 
                 hx-swap="beforeend">

            </div>
        </main>`
    ),
    states: {
        idle: {
            entry: renderTo('content', ({html, context, stream}) => {
                return html`
                        <div class="flex items start gap-2.5  p-2 m-2 w-full">
                            <img class="w-12 h-12 rounded-full"
                                 src="https://flowbite.com/docs/images/people/profile-picture-2.jpg" alt="User Avatar"/>
                            <div class="flex flex-col gap-1 w-full ">
                                <div class="flex items center space-x-2 rtl:space-x-reverse">
                                    <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">User</span>
                                    <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
                                </div>
                                <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                                    <form>
                                        <input type="text" autocomplete="true" list="screen"
                                               class="w-full p-2 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow "
                                               name="message" placeholder="Type a message"/>
                                        <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                                                hx-post="${stream.href}/events/message" hx-swap="outerHTML">Send
                                        </button>
                                        <datalist id="screen">
                                            <option value="Register with password"/>
                                            <option value="Implement a registration system for events that collects attendee information on sessions of interest, dietary preferences." />
                                            <option value="Create a quick registration for checkout process for an e-commerce platform that collects user preferences, and shipping details."/>
                                            <option value="Login with password and captcha"/>
                                        </datalist>

                                    </form>
                                </div>
                            </div>
                        </div>`
            }),

            on: {
                'message': {
                    target: 'draft',
                    actions: assign({
                        request: ({event: {message}}) => message
                    })
                }
            }
        },
        draft: {
            entry: renderTo('content', ({ html}) => html`
                        <${ChatBubble}  name="Assistant" 
                                        img="https://flowbite.com/docs/images/people/profile-picture-5.jpg"
                                        swap="screens" />
                `
            ),
            invoke: {
                src: 'aiElementStream',
                id: 'draft',
                input: {
                    schema: z.object({
                        type: z.string().describe('the screen behavior, for example: register, login, profile update, etc.'),
                        name: z.string().describe('the screen name'),
                        description: z.string().describe('the screen description, including the screen purpose and the required fields and actions.'),
                    }).describe(`publish a screen`),
                    template: `You are an helpfully assistant that helps developers to draft gigya screen sets for their applications.  Your task is to understand the user request and materialize it to a screen list with descreption  {{request}}`,
                }
            },
            on: {
                '*': {
                    actions: renderTo('screens', ({html, event: {name, description}}) => html`
                        <div class="flex items start gap-2.5  p-2 m-2 w-full">
                            <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" />
                            
                            <div class="container shadow-md border-b border-gray-200 bg-white bg-opacity-75 relative top-0 ">
                                <pre class="w-full text-wrap text-sm text-slate-400 overflow-ellipsis bg-white bg-opacity-65 shadow-md ">${description}</pre>
                                <form shadowDom  id="${name}" class="shadow-lg border-slate-400 "   >
                                        <!-- ${description} -->
                                    <fieldset hx-ext="sse" sse-swap="@screen.${name}.input,@screen.${name}" hx-swap="beforeend"   />
                                    <button class="submit" type="submit" sse-swap="@screen.${name}.submit" hx-swap="outerHTML" >Submit</button>
                                    <style hx-ext="sse" sse-swap="@css.${name}" hx-swap="beforeend" /> 
                                </form> 
                            </div>
                        </div>`)
                },
                'output': {
                    target: 'fields',
                    actions: assign({
                        draft: ({event: {output}}) => output
                    })
                }
            },

        } ,
        fields: {
            invoke: {
                src: 'aiElementStream',
                id: 'fields',
                input: ({context:{draft}})=>({
                    template: `You are an expert in Gigya schema and html fields, your task is to help add the missing fields in the form drafts, go over the containers comments and instructions, and publish html fields to each screen  your code will be swapped into the appropriate screen
                        fill the following forms with input fields, your response will be swapped into the form with the  sse-swap attribute. 
                            {{#draft}}
                               <form id="{{name}}"  class="shadow-lg border-slate-400 ">
                                    <!-- {{description}} --> 
                                    <fieldset hx-ext="sse" sse-swap="@screen.{{name}}.input" hx-swap="beforeend" />
                                    <button class="submit outline" type="submit" sse-swap="@screen.{{name}}.submit" hx-swap="outerHTML" >Submit</button>
                             </form> 
                           {{/draft}}`,
                     schema: z.object({
                        type: z.string().describe('the field type, for example: text, email, password, submit, etc.'), 
                        name: z.string().describe('the field name, for example: email, password, address, phone, etc.'),
                        screen: z.string().describe('the screen name, where the field should be swapped into. for example: register, login, preferences etct'), 
                        outerHTML: z.string().describe('the field in a valid html. for example: <input type="text" name="email" /> or <button type="submit">Submit</button>'),
                    }).describe(`publish a field`),
                })
               
            },
            on: {
                '*': {
                    actions: emit(({event: {type, outerHTML, screen}}) => ({
                        event: `@screen.${screen}`,
                        type: 'field',
                        data: outerHTML
                    }))
                } ,
                'output': {
                    target: 'css', 
                    actions: assign({
                        fields: ({event: {output}}) => output
                    })
                }
            }
        },
        css: {
            invoke: {
                src: 'aiStream',
                id: 'css',
                input: {
                    template: `You are an expert in css, your task is to help style the forms in the draft, your response will be swapped  the into the style element  with the  sse-swap attribute.
                           <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" /> 
                           {{#draft}} 
                               <form id="{{name}}" hx-ext="sse" sse-swap="@screen.{{name}}" hx-swap="beforeend" class="shadow-lg border-slate-400 ">
                                    <!-- {{description}} -->
                                     <fieldset hx-ext="sse" sse-swap="@screen.{{name}}.input" hx-swap="beforeend" />
                                     <button class="submit" type="submit" sse-swap="@screen.{{name}}.submit" hx-swap="outerHTML" >Submit</button>
                                  <style hx-ext="sse" sse-swap="@css.{{name}}" hx-swap="beforeend" /> 
                             </form> 
                           {{/draft}}`,
                    system: `You are an expert in css, your task is to help style the forms in the draft, your response will be swapped into the style element with the '@css.text-delta' attribute, response only in css text .`,
                    schema: z.object({
                        type: z.literal('screen'),
                        screen: z.string().describe('the screen id, where the field should be swapped into. for example: register, login, preferences etc'),
                        data: z.string().describe('the css, should be a valid css for example: .container {display: flex;}'),
                    }).describe(`style screen set containers`),
                }
            },
            on: {
                'output': {
                    target: 'done',
                    actions: assign({
                        css: ({event: {output}}) => output
                    })
                },
                '*': {
                    actions: emit(({event: { data, event}}) => ({
                        event: `@css.${event}`,
                        type: 'css',
                        data: data
                    }))
                }
            }
        },
        done: {
            type: 'final',
            output: ({context}) => context
        }
    },
});