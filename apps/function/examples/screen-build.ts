//screen builder
import "https://esm.sh/atomico/ssr/load";
import "yjs";
import { c, css, html } from "https://esm.sh/atomico";
import { AnyEventObject, assign, emit, setup, UnknownActorLogic } from "xstate";
import { fromAIEventStream } from "https://esm.sh/@cxai/stream";
import type { LanguageModelV1 } from "https://esm.sh/@ai-sdk/provider";
import { z } from "https://esm.sh/zod";
type AIStream = ReturnType<
    typeof fromAIEventStream<{ model: LanguageModelV1 }>
>;

type Actors = {
    aiStream: AIStream;
} & Record<string, UnknownActorLogic>;

export const ChatBubble = c(({ content, name, img, swap }) => {
    return html`<div  class="flex items-start gap-2.5  p-2 m-2 w-full">
            <img class="w-12 h-12 rounded-full" src=${img} alt=${name} />
            <div class="flex flex-col gap-1 w-full">
                <div class="flex items center space-x-2 rtl:space-x-reverse">
                    <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">${name}</span>
                    <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400" sse-swap="@${swap}.status" hx-swap="innerHTML">Draft</span>
                </div>
                <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                  <pre class="text-lg text-slate-900 inline text-wrap" sse-swap="${swap}">${content}</pre>
                </div>
            </div>
        </div>
    `;
}, {
    props: {
        swap: {
            type: String,
            reflect: true,
        },
        content: {
            type: String,
            reflect: true,
        },
        name: {
            type: String,
            reflect: true,
        },
        img: {
            type: String,
            reflect: true,
        },
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
    `,
});

customElements.define("chat-bubble", ChatBubble);

export const machine = setup({
    actors: {} as Actors,
    types: {
        emitted: {} as AnyEventObject,
        input: {} as any,
        context: {} as {
            request?: string;
            draft?: [];
            fields?: [];
            css?: [];
        },
    },
}).createMachine({
    id: "screen",
    initial: "idle",
    context: ({ input }) => input,
    entry: emit({
        data: `<main class="mx-auto  bg-slate-50 h-full" >
                 <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                     Screen Set Builder
                 </header>
                <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="content" hx-swap="beforeend" />
            </main>`,
        type: "message"
    }),

    states: {
        idle: {
            entry: emit({
                data: `${
                    html`<chat-bubble name="User"   img="https://flowbite.com/docs/images/people/profile-picture-2.jpg" 
                                          swap="request" content=${`<form hx-swap="outerHTML" sse-swap="request">  
                                                   <input type="text" autocomplete="true" list="screen" class="w-full p-2 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow " name="request" placeholder="What can we build for you?"   />
                                                   <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" hx-post="events/request" >Send</button>
                                                   <datalist id="screen">
                                                        <option value="Register with password"/>
                                                        <option value="Implement a registration system for events that collects attendee information on sessions of interest, dietary preferences." />
                                                        <option value="Create a quick registration for checkout process for an e-commerce platform that collects user preferences, and shipping details."/>
                                                        <option value="Login with password and captcha"/>
                                                     </datalist> 
                                                </form>  `}
                                    />`.render()
                }`,
                type: "content"
            }),

            on: {
                "request": {
                    target: "draft",
                    actions: [
                        assign({
                            request: ({ event: { request } }) => request,
                        }),
                        emit(({ event: { request } }) => ({
                            data: request,
                            type: "request"
                        })),
                        emit(() => ({
                            data: new Date(Date.now()).toLocaleTimeString(),
                            type: "@request.status"
                        })),
                    ],
                },
            },
        },
        draft: {
            entry: emit({
                data: `${
                    html`
                        <${ChatBubble} name="Assistant" 
                                       img="https://flowbite.com/docs/images/people/profile-picture-5.jpg"
                                       swap="screens"/>`.render()
                }`,
                type: "content"
            }),
            invoke: {
                src: "aiElementStream",
                id: "draft",
                input: {
                    schema: z.object({
                        type: z.string().describe(
                            "the screen behavior, for example: register, login, profile update, etc.",
                        ),
                        name: z.string().describe("the screen name"),
                        description: z.string().describe(
                            "the screen description, including the screen purpose and the required fields and actions.",
                        ),
                    }).describe(`publish a screen`),
                    template:
                        `You are an helpfully assistant that helps developers to draft gigya screen sets for their applications.  Your task is to understand the user request and materialize it to a screen list with descreption  {{request}}`,
                },
            },
            on: {
                "*": {
                    actions: [
                        emit(({ event: {name, description } }) => ({
                            type: "screens",
                            data:
                                `<div class="flex items start gap-2.5  p-2 m-2 w-full">
                            <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" ></style>
                           
                            <div class="container shadow-md border-b border-gray-200 bg-white bg-opacity-75 relative top-0 ">
                                <pre class="w-full text-wrap text-sm text-slate-400 overflow-ellipsis bg-white bg-opacity-65 shadow-md ">${description}</pre>
                                <form shadowDom  id="${name}" class="shadow-lg border-slate-400 "   >
                                        <!-- ${description} -->
                                    <fieldset hx-ext="sse" sse-swap="@screen.${name}.input,@screen.${name}" hx-swap="beforeend"   ></fieldset>
                                    <button class="submit" type="submit" sse-swap="@screen.${name}.submit" hx-swap="outerHTML" >Submit</button>
                                    <style hx-ext="sse" sse-swap="@css.${name}" hx-swap="beforeend" ></style> 
                                </form> 
                            </div>
                        </div>`,
                        })),
                        emit(({ event: { name } }) => ({
                            type: `@screen.status`,
                            data: `Drafting screen ${name}`
                        })),
                    ],
                },
                "output": {
                    target: "fields",
                    actions: assign({
                        draft: ({ event: { output } }) => output,
                    }),
                },
            },
        },
        fields: {
            invoke: {
                src: "aiElementStream",
                id: "fields",
                input: ({ context: { draft } }) => ({
                    template:
                        `You are an expert in Gigya schema and html fields, your task is to help add the missing fields in the form drafts, go over the containers comments and instructions, and publish html fields to each screen  your code will be swapped into the appropriate screen
                        fill the following forms with input fields, your response will be swapped into the form with the  sse-swap attribute. 
                            {{#draft}}
                               <form id="{{name}}"  class="shadow-lg border-slate-400 ">
                                    <!-- {{description}} --> 
                                    <fieldset hx-ext="sse" sse-swap="@screen.{{name}}.input" hx-swap="beforeend" />
                                    <button class="submit outline" type="submit" sse-swap="@screen.{{name}}.submit" hx-swap="outerHTML" >Submit</button>
                             </form> 
                           {{/draft}}`,
                    schema: z.object({
                        type: z.string().describe(
                            "the field type, for example: text, email, password, submit, etc.",
                        ),
                        name: z.string().describe(
                            "the field name, for example: email, password, address, phone, etc.",
                        ),
                        screen: z.string().describe(
                            "the screen name, where the field should be swapped into. for example: register, login, preferences etct",
                        ),
                        outerHTML: z.string().describe(
                            'the field in a valid html. for example: <input type="text" name="email" /> or <button type="submit">Submit</button>',
                        ),
                    }).describe(`publish a field`),
                }),
            },
            on: {
                "*": {
                    actions: [
                        emit(({ event: {outerHTML, screen } }) => ({
                        event: `@screen.${screen}`,
                        type: "field",
                        data: outerHTML,
                    })),
                        emit(({ event: {name, screen } }) => ({
                            event: `@screens.status`,
                            type: "field",
                            data: `Drafting field ${name}`,
                        }))
                    ],
                },
                "output": {
                    target: "css",
                    actions: assign({
                        fields: ({ event: { output } }) => output,
                    }),
                },
            },
        },
        css: {
            entry: emit({
                data: 'Processing css...',
                type: '@screens.status',
                format: 'raw'
            }),
            invoke: {
                src: "aiStream",
                id: "css",
                input: {
                    template:
                        `You are an expert in css, your task is to help style the forms in the draft, your response will be swapped  the into the style element  with the  sse-swap attribute.
                           <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" /> 
                           {{#draft}} 
                               <form id="{{name}}" hx-ext="sse" sse-swap="@screen.{{name}}" hx-swap="beforeend" class="shadow-lg border-slate-400 ">
                                    <!-- {{description}} -->
                                     <fieldset hx-ext="sse" sse-swap="@screen.{{name}}.input" hx-swap="beforeend" />
                                     <button class="submit" type="submit" sse-swap="@screen.{{name}}.submit" hx-swap="outerHTML" >Submit</button>
                                  <style hx-ext="sse" sse-swap="@css.{{name}}" hx-swap="beforeend" /> 
                             </form> 
                           {{/draft}}`,
                    system:
                        `You are an expert in css, your task is to help style the forms in the draft, your response will be swapped into the style element with the '@css.text-delta' attribute, response only in css text .`,
                    schema: z.object({
                        type: z.literal("screen"),
                        screen: z.string().describe(
                            "the screen id, where the field should be swapped into. for example: register, login, preferences etc",
                        ),
                        data: z.string().describe(
                            "the css, should be a valid css for example: .container {display: flex;}",
                        ),
                    }).describe(`style screen set containers`),
                },
            },
            on: {
                "output": {
                    target: "done",
                    actions: assign({
                        css: ({ event: { output } }) => output,
                    }),
                },
                "*": {
                    actions: emit(({ event: { data, event } }) => ({
                        event: `@css.${event}`,
                        type: "css",
                        data: data
                    })),
                },
            },
        },
        done: {
            type: "final",
            entry: emit({
                data: "done",
                type: "@screens.status"
            }),
            output: ({ context }) => context,
        },
    },
});

type Machine = typeof machine;

export default machine;
