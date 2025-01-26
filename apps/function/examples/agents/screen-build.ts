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
    return html`<div class="flex items-start gap-4 p-4 m-4 w-full bg-gray-50 dark:bg-gray-800 rounded-lg shadow">
        <img class="w-12 h-12 rounded-full" src=${img} alt=${name} />
        <div class="flex flex-col gap-2 w-full">
            <div class="flex items-center space-x-2 rtl:space-x-reverse">
                <span class="text-lg font-semibold text-gray-900 dark:text-white" sse-swap="@${swap}.name" hx-swap="innerHTML">${name}</span>
                <span class="text-sm font-normal text-gray-500 dark:text-gray-400" sse-swap="@${swap}.status" hx-swap="innerHTML"></span>
            </div>
            <div class="p-4 border border-gray-200 bg-white dark:bg-gray-700 rounded-lg">
                <pre class="text-sm text-gray-900 dark:text-gray-300 whitespace-pre-wrap" sse-swap="${swap}">${content}</pre>
            </div>
        </div>
    </div>`;
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
            draft?: any[];
            fields?: [];
            css?: [];
        },
    },
}).createMachine({
    id: "form",
    initial: "idle",
    context: ({ input }) => input,
    entry: emit({
        data: `<main class="mx-auto bg-slate-100 min-h-screen p-6">
                 <header class="sticky top-0 z-10 backdrop-blur-md bg-opacity-70 border-b border-gray-300 bg-white dark:bg-gray-800 flex items-center justify-center p-4 text-lg font-medium shadow">
                     Form Builder
                 </header>
                <div class="flex flex-col items-center justify-center gap-6" hx-ext="sse" sse-swap="content" hx-swap="beforeend" ></div>
            </main>`,
        type: "message",
    }),

    states: {
        idle: {
            entry: emit({
                data: `${
                    html`<chat-bubble class="w-full" name="User" img="https://flowbite.com/docs/images/people/profile-picture-2.jpg"
                                      swap="request" content=${`<form sse-swap="request" hx-swap="outerHTML" class="flex flex-col gap-4 w-full">  
                                                   <div class="flex gap-2">
                                                     <input type="text" 
                                                            autocomplete="on"
                                                            list="screen" 
                                                            class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                                                            name="request" 
                                                            placeholder="What can we build for you?" />
                                                     <button class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors" 
                                                             type="submit"
                                                             hx-post="events/request"
                                                             hx-target="this">Send</button>
                                                   </div>
                                                   <datalist id="screen">
                                                     <option value="Register with password"></option>
                                                     <option value="Implement a registration system for events that collects attendee information on sessions of interest, dietary preferences."></option>
                                                     <option value="Create a quick registration for checkout process for an e-commerce platform that collects user preferences, and shipping details."></option>
                                                     <option value="Login with password and captcha"></option>
                                                   </datalist> 
                                                </form>`}
                        />`.render()
                }`,
                type: "content",
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
                            type: "request",
                        })),
                        emit(() => ({
                            data: new Date(Date.now()).toLocaleTimeString(),
                            type: "@request.status",
                        })),
                    ],
                },
            },
        },
        draft: {
            entry: [
                emit({
                    data: `${
                        html`<${ChatBubble} class="w-full" name="Assistant"
                                            img="https://flowbite.com/docs/images/people/profile-picture-5.jpg"
                                            swap="screens"/>`.render()
                    }`,
                    type: "content",
                }),
                emit({
                    data: `Drafting &#128396; Forms`,
                    type: "@screens.name",
                }),
            ],
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
                        `You are an helpfully assistant that helps developers to draft gigya screen sets for their applications.  Your task is to understand the user request and materialize it to a screen list with description {{request}}, split the forms to create engaging flow, be creative and help the user to accomplish his task `,
                },
            },
            on: {
                "*": {
                    actions: [
                        emit(({ event: { name, description } }) => ({
                            type: "screens",
                            data:
                                `<div shadowDom  class="flex flex-col items-start gap-4 p-4 m-4 w-full bg-gray-100 dark:bg-gray-800 rounded-lg shadow">
                            <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" ></style>
                           
                            <div class="container shadow-md border-b border-gray-200 bg-white dark:bg-gray-700 bg-opacity-75 relative top-0 ">
                                <pre class="w-full text-sm text-gray-900 dark:text-gray-300 whitespace-pre-wrap">${description}</pre>
                                <form shadowDom  id="${name}" class="shadow-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 rounded-lg"> 
                                        <!-- ${description} -->
                                    <fieldset hx-ext="sse" sse-swap="@screen.${name}.input,@screen.${name}" hx-swap="beforeend"   ></fieldset>
                                    <style hx-ext="sse" sse-swap="@css.${name}" hx-swap="beforeend" ></style> 
                                </form> 
                            </div>. 
                        </div>`,
                        })),
                        emit(({ event: { name } }) => ({
                            type: `@screens.status`,
                            data: `<code>${name}</code>`,
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
            entry: emit({
                data: "Build &#128221;",
                type: "@screens.name",
            }),
            invoke: {
                src: "aiElementStream",
                id: "fields",
                input: {
                    template: `{{#draft}}
                               <form id="{{name}}"  class="shadow-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 rounded-lg ">
                                    <!-- {{description}} --> 
                                    <fieldset hx-ext="sse" sse-swap="@screen.{{name}}.input" hx-swap="beforeend" />
                             </form> 
                           {{/draft}}`,
                    system:
                        `You are an expert in html fields, your task is to help add the missing fields in the form drafts, go over the containers comments and instructions, and publish html fields to each screen  your code will be swapped into the appropriate screen
                        fill the following forms with input fields, your response will be swapped into the form with the  sse-swap attribute
                        !make sure to publish fields to all screens    
                        !make sure to add submit button or link to all screans  `,
                    schema: z.object({
                        type: z.string().describe(
                            "the field type, for example: text, email, password, submit, button etc.",
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
                },
            },
            on: {
                "*": {
                    actions: [
                        emit(({ event: { outerHTML, screen } }) => ({
                            event: `@screen.${screen}`,
                            type: "field",
                            data: outerHTML,
                        })),
                        emit(({ event: { name, screen } }) => ({
                            event: `@screens.status`,
                            type: "field",
                            data:
                                `<code class="text-1Xl">${screen}<code> &#10133;: <code>${name}</code>`,
                        })),
                        assign({
                            draft: (
                                {
                                    event: { outerHTML, screen },
                                    context: { draft },
                                },
                            ) => {
                                const screenDraft = draft?.find(({ name }) =>
                                    name === screen
                                ) || {};
                                const otherDrafts = draft?.filter(({ name }) =>
                                    name !== screen
                                ) || [];
                                return [...otherDrafts, {
                                    ...screenDraft,
                                    fields: [
                                        ...screenDraft.fields || [],
                                        outerHTML,
                                    ],
                                }];
                            },
                        }),
                    ],
                    guard: ({ event: { screen } }) => !!screen,
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
            entry: [
                emit({
                    data:
                        `<code>Processing css in <i>global</i> scope...</code>`,
                    type: "@screens.status",
                }),
                emit({
                    data: "Applying &#128396; styles",
                    type: "@screens.name",
                }),
            ],
            invoke: {
                src: "aiStream",
                id: "css",
                input: {
                    template:
                        `Your task is to help style the forms in the draft, your response will be swapped  the into the style element with the screen name you publish where swap="@css.{{screen}}" or if screen is undefiend will swap into global style where sse-swap="@css.text-delta" . make beautiful styles 
                          form: "<style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" /> 
                           {{#draft}} 
                               <form id="{{name}}" hx-ext="sse" sse-swap="@screen.{{name}}" hx-swap="beforeend" class="shadow-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 rounded-lg">
                                    <!-- {{description}} -->
                                     <fieldset hx-ext="sse" sse-swap="@screen.{{name}}.input" hx-swap="beforeend" >
                                        {{#fields}}{{.}}{{/fields}}
                                     </fieldset>
                                     <style hx-ext="sse" sse-swap="@css.{{name}}" hx-swap="beforeend" /> 
                             </form> 
                           {{/draft}}"`,
                    system:
                        `You are an expert in ux of html forms and css, your task is to help style the forms in the draft, your response will be swapped into the style element with the '@css.text-delta' attribute, response only in css text .`,
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
                "screen": {
                    actions: [
                        emit(({ event: { data, screen } }) => ({
                            type: `@screens.${screen}.status`,
                            data: `<code>Proccessing css in <i>${
                                screen || "global"
                            }</i> scope...</code>`,
                        })),
                        emit(({ event: { data, screen } }) => ({
                            event: `@css.${screen}`,
                            type: "css",
                            data: data,
                        })),
                    ],
                },
            },
        },
        done: {
            type: "final",
            entry: [
                emit({
                    data: `<span class="text-2xl">&#128640; &#128582;</span>`,
                    type: "@screens.status",
                }),
                emit({
                    data: "Done",
                    type: "@screens.name",
                }),
            ],
            output: ({ context }) => context,
        },
    },
});

type Machine = typeof machine;

export default machine;
