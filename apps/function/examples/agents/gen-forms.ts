import "https://esm.sh/atomico/ssr/load";
import "yjs";
import { html } from "https://esm.sh/atomico";
import { AnyEventObject, assign, emit, setup, UnknownActorLogic } from "xstate";
import { fromAIEventStream , fromAIElementStream} from "https://esm.sh/@cxai/stream";
import type { LanguageModelV1 } from "https://esm.sh/@ai-sdk/provider";
import { z } from "https://esm.sh/zod";
import  {ChatBubble} from "https://esm.sh/@cxai/stream@1.0.6/ui";

type Actors = {
    aiStream:  ReturnType< typeof fromAIEventStream<{ model: LanguageModelV1 }> >;
    aiElementStream: ReturnType<typeof fromAIElementStream>;
} & Record<string, UnknownActorLogic>;

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
                     Form Generator  
                 </header>
                <div class="flex flex-col items-center justify-center gap-6"  sse-swap="content" hx-swap="beforeend" >
                      <form  class="isolate flex flex-col gap-4 w-full p-4">
                        <div class="flex gap-2" sse-swap="request" hx-swap="innerHTML transition:true swap:1s ">
                            <input type="text" 
                                   autocomplete="on"
                                   list="screen"
                                   class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                   name="request"
                                   placeholder="What can we build for you?" />
                                     <button class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
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
                    </form>
                </div>
            </main>`  ,
        type: "message"
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
                        })),
                    ],
                },
            },
        },
        draft: {
            entry: [
                emit({
                    type: "content",
                    data:  `<div class="fixed sticky top-0 flex items-center space-x-2 rtl:space-x-reverse">
                <span class="text-lg font-semibold text-gray-900 dark:text-white" sse-swap="@assistant.title" hx-swap="innerHTML transition:true"></span>
                <span class="text-sm font-normal text-gray-500 dark:text-gray-400" sse-swap="@assistant.status" hx-swap="innerHTML transition:true"></span>
            </div>`,
                }),
                emit({
                    data: `<div shadowDom sse-swap="screens" class="isolate transition-all w-full h-full grid grid-cols-3  gap-4 scroll-smooth" hx-swap="beforeend transition:true swap:1s " >
                                    <style 
                                        sse-swap="@css.text-delta" 
                                        hx-swap="beforeend">
                                    </style>
                          </div>`,
                    type: "content",
                    defer: 20
                }),
                emit({
                    data: `Drafting Forms &#128396;`,
                    type: "@assistant.title",
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
                        title: z.string().describe("the screen card title."),
                        name: z.string().describe("the screen name, should be short and without spaces."),
                        description: z.string().describe(
                            "the screen description, including the screen purpose and the required fields and actions.",
                        ),
                    }).describe(`publish a screen`),
                    template:
                        `You are an helpfully assistant that helps developers to draft screen sets for their applications.  Your task is to understand the user request and materialize it to a screen list with description {{request}}, split the forms to create engaging flow, be creative and help the user to accomplish his task `,
                },
            },
            on: {
                "*": {
                    actions: [

                        emit(({ event: { name ,title} }) => ({
                            type: `screens`,
                            data: `<div class="grid grid-rows-subgrid row-span-4 divide-y bg-white rounded-lg shadow-lg border-slate-100 border-2 p-2" sse-swap="@screen.${name}" hx-swap="beforeend transition:true swap:1s">
                                       <span class="bg-slate-50 font-semibold text-center antialiased text-slate-500 text-balance  align-bottom align-text-bottom">${title} (${name})</span> 
                                   </div> 
                                `,
                            defer: 10
                        })),
                        emit(({ event: { name ,description} }) => ({
                            type:`@screen.${name}`,
                            data: `<div class="pt-4 px-2 isolate transition-all">
                                    <form id="${name}"  >
                                        <fieldset sse-swap="@screen.${name}.input"
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
                            type:`@screen.${name}`,
                            data: `<article class="pt-2 w-full text-pretty font-thin line-clamp-2 ">
                                    <p class=" line-clamp-2 text-slate-500"><span class="font-semibold inline">Requirements:</span>
                                        <span class="inline antialiased whitespace-normal">${description}.</span></p>
                                </article>`,
                            defer: 10
                        })),


                        emit(({ event: { name ,description} }) => ({
                            type:`@screen.${name}`,
                            data: `<pre class="bg-slate-50 text-slate-500  antialiased  text-balance whitespace-normal text-end"> 
                                    <p  class="inline text-end" 
                                        sse-swap="@assistant.title,@assistant.${name}.status"
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
                type: "@assistant.title",
            }),
            invoke: {
                src: "aiElementStream",
                id: "fields",
                input: ({ context: { draft } }) => ({
                    template: `{{#draft}}
                               <form id="{{name}}" >
                                    <!-- {{description}} --> 
                                    <fieldset  sse-swap="@screen.{{name}}.input" hx-swap="beforeend transition:true "  />
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
                }),
            },
            on: {
                "*": {
                    actions: [
                        emit(({ event: { outerHTML, screen } }) => ({
                            event: `@screen.${screen}.input`,
                            type: "field",
                            data: outerHTML,
                            defer: 300

                        })),
                        emit(({ event: { name, screen } }) => ({
                            event: `@assistant.status`,
                            type: "field",
                            data: `<code class="text-1Xl">${screen}<code> &#10133;: <code>${name}</code>`,
                            defer: 300

                        })),
                        emit(({ event: { name, screen } }) => ({
                            event: `@assistant.${screen}.status`,
                            type: "field",
                            data: `&#10133;: <code>${name}</code>`,
                            defer: 300
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
                    guard: ({ event: { outerHTML, screen } }) => !!screen,
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
                    type: "@assistant.title",
                }),
            ],
            invoke: {
                src: "aiStream",
                id: "css",
                input: {
                    template:
                        `<div sse-swap="screens" class="w-full h-full grid grid-rows-2 grid-flow-col gap-4 items-start justify-start gap-6 *:h-1/3" hx-swap="beforeend">
                                    <style  
                                        sse-swap="@css.text-delta" 
                                        hx-swap="beforeend ">
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
                    target: "done",
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
        done: {
            type: "final",
            entry: [
                emit({
                    data: `<span class="text-2xl">&#128640; &#128582;</span>`,
                    type: "@assistant.status",
                }),
                emit({
                    data: "&#8730; ",
                    type: "@assistant.title",
                }),
            ],
        },
    },
});

export default machine;
