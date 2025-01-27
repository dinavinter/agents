import "https://esm.sh/atomico/ssr/load";
import "yjs";
import { html } from "https://esm.sh/atomico";
import { AnyEventObject, assign, emit, setup, ActorRef, type UnknownActorLogic, ActorRefFromLogic, enqueueActions } from "xstate";
import { fromAIEventStream, fromAIElementStream, asyncBatchEvents, asyncEventGenerator } from "https://esm.sh/@cxai/stream";
import type { LanguageModelV1 } from "https://esm.sh/@ai-sdk/provider";
import { z } from "https://esm.sh/zod";

type Actors = {
    aiStream: ReturnType<typeof fromAIEventStream<{ model: LanguageModelV1 }>>;
    aiElementStream: ReturnType<typeof fromAIElementStream>;
    batch: typeof asyncBatchEvents;
    stream: typeof asyncEventGenerator;
} & { [x: string]: UnknownActorLogic; }

// Base schemas for HTML elements
const ElementBaseSchema = z.object({
    id: z.string().optional(),
    classes: z.array(z.string()).default([]),
    attributes: z.record(z.string()).default({}),
    styles: z.record(z.string()).default({}),
});

// Device and platform targeting
const DeviceTargetSchema = z.object({
    mobile: z.boolean().default(true),
    tablet: z.boolean().default(true),
    desktop: z.boolean().default(true),
    platforms: z.array(z.string()).default([]),
});

// Component schemas
const ComponentBaseSchema = ElementBaseSchema.extend({
    name: z.string(),
    description: z.string(),
    deviceTarget: DeviceTargetSchema.default({}),
});

const TextComponentSchema = ComponentBaseSchema.extend({
    type: z.literal("text"),
    content: z.string(),
    tag: z.enum(["p", "span", "h1", "h2", "h3", "h4", "h5", "h6"]).default("p"),
});

const ImageComponentSchema = ComponentBaseSchema.extend({
    type: z.literal("image"),
    src: z.string(),
    alt: z.string(),
    loading: z.enum(["lazy", "eager"]).default("lazy"),
    sizes: z.array(z.object({
        width: z.number(),
        height: z.number(),
        breakpoint: z.string().optional(),
    })).optional(),
});

const NavigationComponentSchema = ComponentBaseSchema.extend({
    type: z.literal("navigation"),
    items: z.array(z.object({
        text: z.string(),
        href: z.string(),
        icon: z.string().optional(),
    })),
});

// Define base container schema without children first
const BaseContainerSchema = ElementBaseSchema.extend({
    type: z.literal("container"),
    name: z.string(),
    description: z.string(),
    layout: z.enum(["flex", "grid", "block"]).default("block"),
    deviceTarget: DeviceTargetSchema.default({}),
    responsive: z.boolean().default(true),
    breakpoints: z.array(z.object({
        minWidth: z.string(),
        layout: z.enum(["flex", "grid", "block"]),
    })).optional(),
});

// Create a recursive type for components that can include containers
const ComponentTypes = z.union([
    TextComponentSchema,
    ImageComponentSchema,
    NavigationComponentSchema,
]);

// Now create the full container schema with children that can be components or other containers
const ContainerSchema: z.ZodType<any> = BaseContainerSchema.extend({
    children: z.array(
        z.lazy(() => z.union([ComponentTypes, ContainerSchema]))
    ).default([]),
});

// Final component schema that includes both basic components and containers
const ComponentSchema = z.union([ComponentTypes, ContainerSchema]);

// Container machine for individual containers
const containerMachine =
    setup({
        actors: {} as Actors,
        types: {
            context: {} as z.infer<typeof ContainerSchema> & {
                components?: z.infer<typeof ComponentTypes>[];
                styles?: Record<string, any>;
            },
        },
    }).createMachine({
        id: `container`,
        initial: 'generating',
        context: (input: z.infer<typeof ContainerSchema>) => input,
        states: {
            generating: {
                invoke: {
                    src: 'aiElementStream',
                    id: "components",
                    input: ({ context }) => ({
                        schema: ComponentTypes,
                        messages: [
                            {
                                role: 'system',
                                content: 'Generate components for the container based on its description and requirements.'
                            },
                            {
                                role: 'user',
                                content: `Generate components for container: ${JSON.stringify(context)}`
                            }
                        ]
                    }),
                    onDone: 'styling'
                },
                entry: [
                    emit(({ context: { name } }) => ({
                        data: `<div class="container-status">
                                <div class="bg-white rounded-lg shadow-md p-4">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-lg font-semibold">${name}</span>
                                        <span class="text-sm text-gray-500" sse-swap="@components.status">Generating components...</span>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg mt-2">
                                        <div class="container" sse-swap="${name}.children"></div>
                                    </div>
                                </div>
                              </div>`,
                        type: "content"
                    }))
                ],
                on: {
                    text: {
                        actions: emit(({ event: { content, tag }, context: { name } }: { event: z.infer<typeof TextComponentSchema>, context: z.infer<typeof ContainerSchema> }) => ({
                            data: `<${tag}>${content}</${tag}>`,
                            type: `${name}.children`
                        }))
                    },
                    image: {
                        actions: emit(({ event: { src, alt }, context: { name } }: { event: z.infer<typeof ImageComponentSchema>, context: z.infer<typeof ContainerSchema> }) => ({
                            data: `<img src="${src}" alt="${alt}">`,
                            type: `${name}.children`
                        }))
                    },
                    navigation: {
                        actions: emit(({ event: { items }, context: { name } }: { event: z.infer<typeof NavigationComponentSchema>, context: z.infer<typeof ContainerSchema> }) => ({
                            data: items.map(item => `<a href="${item.href}">${item.label}</a>`).join(''),
                            type: `${name}.children`
                        }))
                    }
                    // container: {
                    //     actions: enqueueActions(({ spawn, event: { name }, context: { name: containerName } }: { event: z.infer<typeof ContainerSchema>, context: z.infer<typeof ContainerSchema>}) => {

                    //         emit({
                    //             data: `<div class="container" sse-swap="${name}.content"></div>`,
                    //             type: `${containerName}.children`
                    //         });

                    //         assign({
                    //             containers: ({ context, event: { name, ...event }, spawn }) => {
                    //                 return [...(context.containers || []), spawn(containerMachine, { input: { name } })]
                    //             }
                    //         })

                           
                    //     })
                    // }
                }
            },
            styling: {
                invoke: {
                    src: 'aiStream',
                    id: "styles",
                    input: ({ context }) => ({
                        messages: [
                            {
                                role: 'system',
                                content: 'Generate responsive CSS using Tailwind-like utility classes and CSS custom properties.'
                            },
                            {
                                role: 'user',
                                content: `Generate styles for container and components:\n${JSON.stringify(context, null, 2)}`
                            }
                        ]
                    }),
                    onDone: 'preview'
                },
                entry: [
                    emit(({ context: { name } }) => ({
                        data: `<div class="style-status">
                                <div class="bg-white rounded-lg shadow-md p-4">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-lg font-semibold">${name}</span>
                                        <span class="text-sm text-gray-500" sse-swap="@styles.status">Generating styles...</span>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg mt-2">
                                        <pre class="whitespace-pre-wrap" sse-swap="@styles.text-delta"></pre>
                                    </div>
                                </div>
                              </div>`,
                        type: "content"
                    }))
                ],
            },
            preview: {
                entry: [
                    emit(({ context: { name,components, styles } }) => ({
                        data: `<div class="preview-${name}">
                                <div class="bg-white rounded-lg shadow-md p-4">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-lg font-semibold">${name}</span>
                                        <span class="text-sm text-gray-500">Preview</span>
                                    </div>
                                    <div class="border rounded-lg p-4 mt-2">
                                        <style>${styles}</style>
                                        <div class="preview-content" sse-swap="@preview.content">
                                            ${JSON.stringify(components, null, 2)}
                                        </div>
                                    </div>
                                </div>
                              </div>`,
                        type: "content"
                    }))
                ],
                on: {
                    "update": {
                        actions: [
                            assign({
                                container: ({ event }) => event,
                            }),
                            emit(({ event }) => ({
                                data: JSON.stringify(event, null, 2),
                                type: "preview.content"
                            }))
                        ]
                    },
                },
            },
        },
    });

// Main HTML generator machine
export const machine = setup({
    actors: {} as Actors,
    types: {
        emitted: {} as AnyEventObject,
        input: {} as any,
        context: {} as {
            request?: string;
            containers: Map<string, ActorRefFromLogic<typeof containerMachine>>;
        },
    },
}).createMachine({
    id: "html-generator",
    initial: "idle",
    context: {
        containers: new Map(),
    },
    entry: emit({
        data: `<main class="mx-auto bg-slate-100 min-h-screen p-6">
                <header class="sticky top-0 z-10 backdrop-blur-md bg-opacity-70 border-b border-gray-300 bg-white dark:bg-gray-800 flex items-center justify-center p-4 text-lg font-medium shadow">
                    HTML Generator
                </header>
                <div class="flex flex-col items-center justify-center gap-6" hx-ext="sse" sse-swap="content" hx-swap="beforeend">
                    <form class="isolate flex flex-col gap-4 w-full p-4">
                        <div class="flex gap-2" sse-swap="request">
                            <input type="text"
                                   autocomplete="on"
                                   list="templates"
                                   class="flex-1 p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                   name="request"
                                   placeholder="Describe the container or component to generate..." />
                            <button class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
                                    type="submit"
                                    hx-post="events/request"
                                    hx-target="this">Generate</button>
                        </div>
                        <datalist id="templates">
                            <option value="Create a responsive container for a product listing page, mobile-first"></option>
                            <option value="Generate a navigation component with dropdown menus"></option>
                            <option value="Build a grid container for a photo gallery with lazy loading"></option>
                            <option value="Design a form container with responsive layout"></option>
                        </datalist>
                    </form>
                </div>
            </main>`,
        type: "message"
    }),

    states: {
        idle: {
            on: {
                "request": {
                    target: "analyzing",
                    actions: [
                        assign({
                            request: ({ event: { request } }) => request,
                        }),
                        emit(({ event: { request } }) => ({
                            data: request,
                            type: "request"
                        }))
                    ],
                },
            },
        },
        analyzing: {
            entry: [
                emit({
                    data: `<div class="analyzing-status">
                            <div class="bg-white rounded-lg shadow-md p-4">
                                <div class="flex items-center space-x-2">
                                    <span class="text-lg font-semibold">Analysis</span>
                                    <span class="text-sm text-gray-500" sse-swap="@container.status">Analyzing request...</span>
                                </div>
                                <div class="bg-gray-50 p-4 rounded-lg mt-2">
                                    <pre class="whitespace-pre-wrap" sse-swap="@container.text-delta"></pre>
                                </div>
                            </div>
                          </div>`,
                    type: "content"
                })
            ],
            invoke: {
                src: 'aiElementStream',
                id: "container",
                input: ({ context: { request } }) => ({
                    schema: ContainerSchema,
                    messages: [
                        {
                            role: 'system',
                            content: 'Generate a container specification based on the request. Include detailed description and device targeting.'
                        },
                        {
                            role: 'user',
                            content: request
                        }
                    ]
                }),
                on: {
                    container: {
                        target: 'managing',
                        actions: [
                            assign({
                                containers: ({ context, event: { name, ...event }, spawn }) => {
                                    const containerId = `container-${name}`;

                                    // Stop existing container if it exists
                                    const existingRef = context.containers.get(containerId);
                                    if (existingRef) {
                                        existingRef.stop();
                                    }

                                    // Spawn new container
                                    const containerRef = spawn(containerMachine, { id: containerId, input: { name, ...event } });
                                    const newContainers = new Map(context.containers);
                                    newContainers.set(containerId, containerRef);
                                    return newContainers;
                                }
                            }),
                            emit(({ event: { name } }: { event: z.infer<typeof ContainerSchema> }) => ({
                                data: `<div sse-swap="@container-${name}.content" hx-swap="beforeend" id="${name}"></div>`,
                                type: `content`
                            })),
                            emit(({
                                data: "Container created",
                                type: "container.status"
                            }))
                        ]
                    }
                }
            }
        },
        managing: {
            on: {
                "request": {
                    target: "analyzing",
                    actions: [
                        assign({
                            request: ({ event: { request } }) => request,
                        }),
                        emit(({ event: { request } }) => ({
                            data: request,
                            type: "request"
                        }))
                    ],
                },
                "update.container": {
                    actions: [
                        ({ context, event }) => {
                            const containerId = `container-${event.container.name}`;
                            const containerRef = context.containers.get(containerId);
                            if (containerRef) {
                                containerRef.send({ type: "update", container: event.container });
                            }
                        }
                    ]
                },
                "remove.container": {
                    actions: [
                        assign({
                            containers: ({ context, event }) => {
                                const containerId = `container-${event.name}`;
                                const containerRef = context.containers.get(containerId);
                                if (containerRef) {
                                    containerRef.stop();
                                }
                                const newContainers = new Map(context.containers);
                                newContainers.delete(containerId);
                                return newContainers;
                            }
                        })
                    ]
                }
            },
            exit: [
                // Cleanup all containers when exiting the managing state
                ({ context }) => {
                    for (const containerRef of context.containers.values()) {
                        containerRef.stop();
                    }
                }
            ]
        }
    },
});

export default machine;
