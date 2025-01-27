import "https://esm.sh/atomico/ssr/load";
import "yjs";
import { c, css, html } from "https://esm.sh/atomico";
import { AnyEventObject, assign, emit, setup, UnknownActorLogic } from "xstate";
import { fromAIEventStream } from "@cxai/stream";
import type { LanguageModelV1 } from "@ai-sdk/provider";
import { z } from "zod";
type AIStream = ReturnType<
    typeof fromAIEventStream<{ model: LanguageModelV1 }>
>;

type Actors = {
    aiStream: AIStream;
    apiWorker?: typeof newDenoHTTPWorker;
} & Record<string, UnknownActorLogic>;


function name(title: string) {
    return title.replace(/\s+/g, "-").toLowerCase();
}

export const ChatBubble = c(({ content, name, img, swap }) => {
    return html`<div class="flex items-start gap-4 p-4 m-4 w-full bg-gray-50 dark:bg-gray-800 rounded-lg shadow">
        <img class="w-12 h-12 rounded-full" src=${img} alt=${name} />
        <div class="flex flex-col gap-2 w-full">
          
            <div class="p-4 border border-gray-200 bg-white dark:bg-gray-700 rounded-lg">
                <div class="flex items-center space-x-2 rtl:space-x-reverse">
                                <span class="text-lg font-semibold text-gray-900 dark:text-white" sse-swap="@${swap}.name" hx-swap="innerHTML">${name}</span>
                                <span class="text-sm font-normal text-gray-500 dark:text-gray-400" sse-swap="@${swap}.status" hx-swap="innerHTML"></span>
                            </div>        
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
            api?: any;
        },
    },
}).createMachine({
    id: "app",
    initial: "idle",
    context: ({ input }) => input,
    entry: emit({
        data: `<main class="mx-auto bg-slate-100 min-h-screen p-6">
                    <header class="sticky top-0 z-10 backdrop-blur-md bg-opacity-70 border-b border-gray-300 bg-white dark:bg-gray-800 flex items-center justify-center p-4 text-lg font-medium shadow">
                        App Builder
                    </header>
                    <div class="flex flex-col items-center justify-center gap-6"  sse-swap="content" hx-swap="beforeend" >
                        <form  class="isolate flex flex-col gap-4 w-full p-4">
                            <div class="flex gap-2">
                                <input type="text" 
                                    autocomplete="on"
                                    list="components" 
                                    class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                                    name="request" 
                                    placeholder="What kind of app would you like to build?" />
                                <button class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors" 
                                        hx-post="events/request"
                                        hx-target="this">Create</button>
                            </div>
                            <datalist id="components">
                                <option value="Create a dashboard with analytics widgets"></option>
                                <option value="Build a task management app with drag-and-drop features"></option>
                                <option value="Design a media player with playlist management"></option>
                                <option value="Create a chat application with real-time messaging"></option>
                            </datalist>
                        </form>
                    </div>          
                </main>`,
        type: "message",
    }),

    states: {
        idle: { 
            on: {
                "request": {
                    target: "draft",
                    actions: [
                        assign({
                            request: ({ event: { request } }) => request,
                        }),
                        emit(({ event: { request } }) => ({
                            data: `<div class="flex gap-2 w-full p-4">
                               <input type="text"
                               class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                               name="request"
                               disabled
                               value="${request}" />
                             </div> `,
                            type: "request",
                            defer: 250

                        })),
                        emit(() => ({
                            data: new Date(Date.now()).toLocaleTimeString(),
                            type: "@request.status",
                            defer: 500
                        }))
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
                                    swap="assistant"/>`.render()
                    }`,
                    
                    type: "content",
                }),
                emit({
                    data: `<div shadowDom sse-swap="components" class="isolate transition-all w-full h-full grid grid-cols-3  gap-4 scroll-smooth" hx-swap="beforeend transition:true swap:1s " >
                                   <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" ></style>
                          </div>`,
                    type: "content",
                    defer: 20
                }),
             
                emit({
                    data: `Drafting &#128396; App Components`,
                    type: "@assistant.name",
                }),
            ],
            invoke: {
                src: "aiElementStream",
                id: "draft",
                input: {
                    schema: z.object({
                        type: z.string().describe(
                            "the component type, for example: dashboard, player, chat, etc.",
                        ),
                        name: z.string().describe("the component name, characters, nymbers and hyphens are allowed."),
                        description: z.string().describe(
                            "the component description, including its purpose, features, and required elements.",
                        ),
                    }).describe(`publish a component`),
                    template:
                        `You are a helpful assistant that helps developers to draft components for their applications. Your task is to understand the user request and materialize it into a component list with descriptions {{request}}, create an engaging and interactive layout, be creative and help the user to accomplish their task`,
                },
            },
            on: {
                "*": {
                    actions: [

                        emit(({ event: { name ,title} }) => ({
                            type: `components`,
                            data: `<div class="grid grid-rows-subgrid row-span-4 divide-y bg-white rounded-lg shadow-lg border-slate-100 border-2 p-2" sse-swap="@component.${name}" hx-swap="beforeend transition:true swap:1s">
                                       <span class="bg-slate-50 font-semibold text-center antialiased text-slate-500 text-balance  align-bottom align-text-bottom">${title || name} </span> 
                                   </div> 
                                `,
                            defer: 10
                        })),
                        emit(({ event: { name } }) => ({
                            type:`@component.${name}`,
                            data: `<div class="pt-4 px-2 isolate transition-all">
                                    <form id="${name}"  >
                                        <fieldset sse-swap="@component.${name}.input"
                                                hx-swap="beforeend transition:true swap:1s">
                                        </fieldset>
                                        <style
                                                sse-swap="@css.${name}"
                                                hx-swap="beforeend transition:false">
                                        </style>
                                    </form>
                                </div>`,
                            defer: 500
                        })),

                        emit(({ event: { name ,description} }) => ({
                            type:`@component.${name}`,
                            data: `<article class="pt-2 w-full text-pretty font-thin line-clamp-2 ">
                                    <p class=" line-clamp-2 text-slate-500"><span class="font-semibold inline">Requirements:</span>
                                        <span class="inline antialiased whitespace-normal">${description}.</span></p> 
                                </article>`,
                            defer: 10
                        })),

                     emit(({ event: { name ,description} }) => ({
                            type:`@component.${name}`,
                            data: `<article class="pt-2 w-full text-pretty font-thin line-clamp-2 ">
                                    <p class=" line-clamp-3 text-slate-500"  ><span class="font-semibold inline">API:</span>
                                        <pre class="inline antialiased whitespace-normal"sse-swap="@component.${name}.api"
                                                hx-swap="beforeend transition:true swap:1s">.</pre></p> 
                                </article>`,
                            defer: 10
                        })),
                        emit(({ event: { name } }) => ({
                            type:`@component.${name}`,
                            data: `<pre class="bg-slate-50 text-slate-500  antialiased  text-balance whitespace-normal text-end"> 
                                    <p  class="inline text-end" 
                                        sse-swap="@component.${name}.status"
                                        hx-swap="innerHTML transition:true" >>${name}</p></pre>`,
                            defer: 10
                        })),

                        emit(({ event: { name } }) => ({
                            type: `@assistant.status`,
                            data: `<code>${name}</code>`,
                            defer: 10
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
                type: "@assistant.name",
            }),
            invoke: {
                src: "aiElementStream",
                id: "fields",
                input: ({ context: { draft } }) => ({
                    template: `{{#draft}}
                               <form id="{{name}}" >
                                    <!-- {{description}} --> 
                                    <fieldset  sse-swap="@component.{{name}}.input" hx-swap="beforeend transition:true "  />
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
                       
                        component: z.string().describe(
                            "the form id, where the field should be swapped into. for example: analytics-dashboard, player, chat, etc.",
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
                        emit(({ event: { outerHTML, component } }) => ({
                            event: `@component.${component}.input`,
                            type: "element",
                            data: outerHTML,
                            defer: 300
                      
                        })),
                        emit(({ event: { name, component } }) => ({
                            event: `@assistant.status`,
                            type: "field",
                            data:
                                `<code class="text-1Xl">${component}<code> &#10133;: <code>${name}</code>`,
                            defer: 300

                        })),
                        assign({
                            draft: (
                                {
                                    event: { outerHTML, component },
                                    context: { draft },
                                },
                            ) => {
                                const componentDraft = draft?.find(({ name }) =>
                                    name === component
                                ) || {};
                                const otherDrafts = draft?.filter(({ name }) =>
                                    name !== component
                                ) || [];
                                return [...otherDrafts, {
                                    ...componentDraft,
                                    fields: [
                                        ...componentDraft.fields || [],
                                        outerHTML,
                                    ],
                                }];
                            },
                        }),
                    ],
                    guard: ({ event: { component } }) => !!component,
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
                        `<code>Proccessing css in <i>global</i> scope...</code>`,
                    type: "@assistant.status",
                }),
                emit({
                    data: "Applying styles &#128396;",
                    type: "@assistant.name",
                }),
            ],
            invoke: {
                src: "aiStream",
                id: "css",
                input: {
                    template:
                        `<div shadowDom sse-swap="components" class="isolate transition-all w-full h-full grid grid-cols-3  gap-4 scroll-smooth" hx-swap="beforeend transition:true swap:1s " >
                                   <style hx-ext="sse" sse-swap="@css.text-delta" hx-swap="beforeend" > 
                                           <!--here go your css code! --> 
                                    </style>
                                    {{#draft}} 
                                        <form  id="{{name}}"  >
                                            <!-- {{description}} -->
                                            <fieldset  >
                                                 {{#fields}}{{.}}{{/fields}}
                                            </fieldset> 
                                       </form>
                                   {{/draft}}
                               </div>`,
                    system:
                        `You are an expert in ux of html forms and css, your task is to help style the forms in the draft.You are an expert in ux of html forms and css, your task is to help style the forms in the draft.your response will be swapped into the style element with the '@css.text-delta' attribute.You are an expert in ux of html forms and css, your task is to help style the forms in the draft.You are an expert in ux of html forms and css, your task is to help style the forms in the draft.your response will be swapped into the style element with the '@css.text-delta' attribute.esponse only in css text , make sure to not effect anything outside the form elements themself .- your response will be swapped into the style element with the '@css.text-delta' attribute,
                    - your response will be swapped into the style element with the '@css.text-delta' attribute, response only in css text 
                    - response only in css text , make sure to not effect anything outside the form elements themself .
                    - make sure to not effect anything outside the form elements themself .
                    - make beautiful and immpressive styles! use animations, use icons, use pseudo css and responsive desigh 
                    `,
                },
            },
            on: {
                "output": {
                    target: "api",
                    actions: assign({
                        css: ({ event: { output } }) => output,
                    }),
                },
                "screen": {
                    actions: [
                        emit(({ event: { data, screen } }) => ({
                            type: `@assistant.${screen}.status`,
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
        api: {
            entry: [
                emit({
                    data: "Generating API &#128736;",
                    type: "@assistant.name",
                }),
                emit({
                    data: `<code>Implementing API endpoints...</code>`,
                    type: "@assistant.status",
                }),
            ],
            invoke: {
                src: "aiElementStream",
                id: "api",
                input: ({ context: { draft } }) => ({
                    template: `{{#draft}}
                        Component: {{name}}
                        Description: {{description}}
                        Fields: {{#fields}}{{.}}{{/fields}}
                    {{/draft}}`,
                    system: `You are an expert in creating REST APIs with Deno. Your task is to create API endpoints for each component.
                            For each component:
                            1. Create appropriate REST endpoints (GET, POST, PUT, DELETE)
                            2. Implement proper request/response handling
                            3. Add data validation
                            4. Include error handling
                            5. Add TypeScript types and interfaces
                            Make the API secure, efficient, and following best practices.`,
                    schema: z.object({
                        type: z.string().describe("the component type"),
                        name: z.string().describe("the component name"),
                        code: z.string().describe("the Deno HTTP worker code implementation"),
                        endpoints: z.array(z.object({
                            method: z.string(),
                            path: z.string(),
                            description: z.string()
                        })).describe("list of implemented endpoints"),
                    }).describe("API implementation for a component"),
                }),
            },
            on: {
                "*": {
                    actions: [
                        emit(({ event: { name, code } }) => ({
                            type: `@component.${name}.api`,
                            data: `<div class="api-docs p-4 bg-slate-50 rounded-lg">
                                    <pre class="text-sm text-slate-700 whitespace-pre-wrap">${code}</pre>
                                  </div>`,
                            defer: 300
                        })),
                        emit(({ event: { name, endpoints } }) => ({
                            type: `@component.${name}.status`,
                            data: `<div class="endpoints-list">
                                    ${endpoints.map(e => 
                                        `<span class="inline-flex items-center px-2 py-1 mr-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
                                            ${e.method} ${e.path}
                                        </span>`
                                    ).join('')}
                                  </div>`,
                            defer: 300
                        }))
                     
                    ],
                },
                "output": {
                    target: "done",
                    actions: assign({
                        api: ({ event: { output } }) => output,
                    }),
                },
            },
        },
        done: {
            type: "final",
            entry: [
                emit({
                    data: `<span class="text-2xl">&#128640; &#128582;</span>`,
                    type: "@components.status",
                }),
                emit({
                    data: "Done",
                    type: "@components.name",
                }),
            ],
            output: ({ context }) => context,
        },
    },
});

type Machine = typeof machine;

export default machine;
