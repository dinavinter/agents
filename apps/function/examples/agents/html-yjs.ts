import * as Y from "yjs";
import { AnyEventObject, assign, emit, setup } from "xstate";
import { fromAIEventStream, fromAIElementStream, asyncBatchEvents, asyncEventGenerator } from "@cxai/stream";
import type { LanguageModelV1 } from "@ai-sdk/provider";
import { z } from "zod";
type Actors = {
    aiStream: ReturnType<typeof fromAIEventStream<{ model: LanguageModelV1 }>>;
    aiElementStream: ReturnType<typeof fromAIElementStream>;
} & Record<string, UnknownActorLogic>;

export interface EventMessage {

    type: string;
    /**
     * Message payload
     */
    data?: string;

    /**
     * Message identifier, if set, client will send `Last-Event-ID: <id>` header on reconnect
     */
    id?: string;

    /**
     * Message type
     */
    event?: string;

    /**
     * Update client reconnect interval (how long will client wait before trying to reconnect).
     */
    retry?: number;

    /**
     * Message comment
     */
    comment?: string;
}

// Base schemas for common properties
const BaseOperation = z.object({
    target: z.string()
});

const WithAttributes = z.object({
    attributes: z.record(z.string(), z.string())
});

const WithContent = z.object({
    content: z.string()
});

const WithPosition = z.object({
    position: z.number()
});

const WithTag = z.object({
    tag: z.string()
});

/*
z.object({
                explain: z.string().describe('the explanation of the changes that required to the code'),
                ops: z.array(z.object({
                    selector: z.string().describe('the selector of the element to change, support only tag names'),
                    insert: z.array(inputFieldYElementSchema).describe('the elements to insert into the element'),
                    index: z.number().optional().describe('the index to insert the content into the element, default to the end'),
                })
                    z.object({
                explain: z.string().describe('the explanation of the changes that required to the code'),
                ops: z.array(z.object({
                    selector: z.string().describe('the selector of the element to change, support only tag names'),
                    attributes: z.record(z.string()).describe('the attributes to change on the element')
                })).describe('the changes to apply to the code')
            }))
*/

const deltaUpdateEventSchema = z.object({
    
// Composed operation schemas
const SetAttributeOperation = BaseOperation.merge(WithAttributes).extend({
    type: z.literal("setAttribute")
});

const AppendChildOperation = BaseOperation.merge(WithContent)
    .merge(WithTag)
    .merge(WithAttributes.partial())
    .merge(WithPosition.partial())
    .extend({
        type: z.literal("appendChild")
    });

const InsertBeforeOperation = BaseOperation.merge(WithContent)
    .merge(WithPosition)
    .extend({
        type: z.literal("insertBefore")
    });

const RemoveOperation = BaseOperation.extend({
    type: z.literal("remove")
});

const RemoveChildOperation = BaseOperation.merge(WithPosition).extend({
    type: z.literal("removeChild")
});

const SetContentOperation = BaseOperation.merge(WithContent).extend({
    type: z.literal("setContent")
});

// Combined schema
const ElementOperationSchema = z.discriminatedUnion("type", [
    SetAttributeOperation,
    AppendChildOperation,
    InsertBeforeOperation,
    RemoveOperation,
    RemoveChildOperation,
    SetContentOperation
]);

type ElementOperation = z.infer<typeof ElementOperationSchema>;

// Schema for component types
const ComponentTypeSchema = z.enum(['text', 'image', 'navigation', 'container', 'form', 'button']);

// Schema for component generation request
const ComponentRequestSchema = z.object({
    type: ComponentTypeSchema,
    description: z.string(),
    parent: z.string().optional(), // Parent element's XPath or ID
    position: z.number().optional(),
});

export const machine = setup({
    types: {} as {
        actors: Actors;
        emitted: EventMessage,
        context: {
            doc: Y.Doc;
            fragment: Y.XmlFragment;
            request?: string;
            components: z.infer<typeof ComponentRequestSchema>[];
            analysis: string | undefined;
            status: string | undefined;
            textDelta: string | undefined;
        },
        events: z.infer<typeof ElementOperationSchema> | { type: 'request', request: string } | { type: 'output', output: any },
        input: { model: LanguageModelV1 }
    },
    actions: {
        emitContent: emit(({ context }) => ({
            type: 'content',
            data: context.fragment.toJSON()
        })),
        emitStatus: emit(({ context }) => ({
            type: 'status',
            data: context.status
        })),
        emitTextDelta: emit(({ context }) => ({
            type: 'text-delta',
            data: context.textDelta
        }))
    }
}).createMachine({
    id: "yjs-html-generator",
    initial: "idle",
    context: {
        doc: new Y.Doc(),
        fragment: new Y.XmlFragment(),
        components: [],
        analysis: undefined,
        status: undefined,
        textDelta: undefined
    },
    entry: [
        assign({
            fragment: ({ context }) => {
                const fragment = context.doc.getXmlFragment('root');
                const main = new Y.XmlElement('main');
                main.setAttribute('class', 'mx-auto bg-slate-100 min-h-screen p-6');
                fragment.push([main]);
                return fragment;
            }
        }),
        emit({
            data: `<main class="mx-auto bg-slate-100 min-h-screen p-6">
                    <header class="sticky top-0 z-10 backdrop-blur-md bg-opacity-70 border-b border-gray-300 bg-white dark:bg-gray-800 flex items-center justify-center p-4 text-lg font-medium shadow">
                        Website Generator
                    </header>
                    <div class="flex flex-col items-center justify-center gap-6"  hx-swap="beforeend">
                        <form class="isolate flex flex-col gap-4 w-full p-4">
                            <div class="flex gap-2" sse-swap="request" hx-swap="innerHTML transition:true swap:1s">
                                <textarea
                                    class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    name="request"
                                    rows="4"
                                    placeholder="Describe the website you want to build..."></textarea>
                                    <button class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
                                        type="submit"
                                        hx-post="events/request"
                                        hx-target="this">Generate</button>
                            </div>
                        </form>
                       <div class="grid grid-cols-3 gap-4" sse-swap="content" hx-swap="beforeend transition:true ">
                       </div>
    
                    </div>
                </main>`,
            type: "message"
        }),
        emit(({ context }) => ({
            type: 'content',
            data: context.fragment.toJSON(),
            defer: 300
        }))
    ],
    states: {
        idle: {
            entry: [
                assign({ status: "Ready to generate components" }),
            ],
            on: {
                request: {
                    target: "analyzing",
                    actions: [
                        assign({ 
                            request: ({ event }) => event.request,
                            status: "Analyzing request..."
                        }),
                        "emitStatus"
                    ]
                }
            }
        },
        analyzing: {
            invoke: {
                src: "aiElementStream",
                input:({
                    schema: ComponentRequestSchema,
                    prompt: "Generate a component specification based on the request.",
                    template: "request: {{request}}" 
                })
            },
            on: {
                output: {
                    target: "generating",
                    actions: [
                        assign({
                            analysis: ({ event }) => event.output,
                            components: ({ context, event }) => [...context.components, event.output],
                            status: "Component specification generated",
                            textDelta: ({ event }) => JSON.stringify(event.output, null, 2)
                        }),
                        "emitStatus",
                        "emitTextDelta"
                    ]
                }
            }
        },
        generating: {
            entry: [
                assign({ status: "Generating component..." })
            ],
            always:{
                actions:[  "emitContent",
                    "emitStatus"]
            },
            invoke: {
                src: "aiElementStream",
                input: ({ context }) => ({
                    schema: ElementOperationSchema,
                    messages: [
                        {
                            role: "system",
                            content: "Generate XML element operations to create the component."
                        },
                        {
                            role: "user",
                            content: `Generate operations for component: ${JSON.stringify(context.analysis)}`
                        }
                    ]
                }),
                onDone: {
                    target: "idle",
                    actions: [
                        assign({ status: "Component generation complete" }),
                        "emitStatus"
                    ]
                }
            },
            on: {

                "setAttribute": {
                    actions: [
                        ({ context, event }) => {
                            const { target, attributes } = event;
                            const targetElement = context.fragment.querySelector(target || '');
                            if (!targetElement) return;
                            targetElement.setAttribute(attributes);
                        }
                    ]
                },
                "appendChild": {
                    actions: [
                        ({ context, event } : { context: { fragment: Y.Fragment }, event: z.infer<typeof ElementOperationSchema> }) => {
                            const { target, tag, attributes, position } = event;
                            const targetElement = context.fragment.querySelector(target || '');
                            if (!targetElement) return;
                            targetElement.appendChild(new Y.XmlElement(tag, attributes), position);
                        }
                    ]
                },
                "insertBefore": {
                    actions: [
                        ({ context, event }) => {
                            const { target, content, position } = event;
                            const targetElement = context.fragment.querySelector(target);
                            if (!targetElement) return;
                            targetElement.insert(position, [ new Y.XmlElement(content) ]);
                        }
                    ]
                },
                "remove": {
                    actions: [
                        ({ context, event }) => {
                            const { target } = event;
                            const targetElement = context.fragment.querySelector(target);
                            if (!targetElement) return;
                            targetElement.parent?.delete(targetElement.index, 1);
                        }
                    ]
                },
                "removeChild": {
                    actions: [
                        ({ context, event }) => {
                            const { target, position } = event;
                            const targetElement = context.fragment.querySelector(target);
                            if (!targetElement) return;
                            targetElement.removeChild(position);
                        }
                    ]
                },
                "setContent": {
                    actions: [
                        ({ context, event }: { context: { fragment: Y.Fragment }, event: z.infer<typeof ElementOperationSchema> }) => {
                            const { target, content } = event;
                            const targetElement = context.fragment.querySelector(target || '');
                            if (!targetElement) return;
                            targetElement.setContent(content);
                        }
                    ]
                }
            }
        }
    }
});

export default machine;
