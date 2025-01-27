import "https://esm.sh/atomico/ssr/load";
import "yjs";
import { html } from "https://esm.sh/atomico";
import { AnyEventObject, assign, emit, setup, UnknownActorLogic } from "xstate";
import { fromAIEventStream, fromAIElementStream } from "https://esm.sh/@cxai/stream";
import type { LanguageModelV1 } from "https://esm.sh/@ai-sdk/provider";
import { z } from "https://esm.sh/zod";

type Actors = {
    aiStream: ReturnType<typeof fromAIEventStream<{ model: LanguageModelV1 }>>;
    aiElementStream: ReturnType<typeof fromAIElementStream>;
} & Record<string, UnknownActorLogic>;

const RequirementsSchema = z.object({
    needs: z.string(),
    wants: z.string(),
    type: z.enum(["business", "technical" , "store-front", "other"]).default("business"),
});

const ProductSpecSchema = z.object({
    type: z.enum(["feature", "user-flow", "priority"]).default("feature"),
    title: z.string(),
    description: z.string() ,
    priority: z.number().default(0),
});

const ArchitectureSchema = z.object({
    type: z.enum(["backend", "frontend", "api"]),
    title: z.string(),
    description: z.string() ,
    stack: z.array(z.string()),
    dependencies: z.array(z.string()),
    priority: z.number().default(0),
});

const UXDesignSchema = z.object({
    type: z.enum(["page", "layout", "component"]),
    wireframes: z.array(z.string()),
    styles: z.object({
        colors: z.array(z.string()),
        typography: z.array(z.string())
    }),
    components: z.array(z.string()),
});

const ImplementationSchema = z.object({
    type: z.enum(["backend", "frontend", "api"]).default("frontend"),
    title: z.string(),
    description: z.string() ,
    content: z.array(z.string()),
    language: z.array(z.string()),
     "start-command": z.string()
})

const FrontendSchema = z.object({
    type: z.enum(["page", "component", "layout"]),
    name: z.string(),
    path: z.string(),
    content: z.string(),
    styles: z.object({
        css: z.string().optional(),
        tailwind: z.boolean().default(true)
    }),
    dependencies: z.array(z.string()).default([]),
    scripts: z.array(z.string()).default([])
});

const PageSchema = z.object({
                       type : z.enum(["page"]).default("page"), 
                       title : z.string(),
                       outerHtml : z.string(),
                       path: z.string().default("/"),
                       id: z.string()
 })

const renderArtifact = (title: string, content: any) => `
    <div class="p-4 mb-4 bg-white rounded-lg shadow-md">
        <h2 class="text-xl font-semibold mb-2">${title}</h2>
        <div class="space-y-2">
            ${Object.entries(content).map(([key, value]) => `
                <div>
                    <h3 class="font-medium text-gray-700">${key}</h3>
                    ${Array.isArray(value) 
                        ? `<ul class="list-disc pl-5 space-y-1">
                            ${(value as string[]).map(item => `<li class="text-gray-600">${item}</li>`).join('')}
                           </ul>`
                        : typeof value === 'object'
                            ? Object.entries(value as Record<string, string[]>).map(([subKey, subValue]) => `
                                <div class="ml-4">
                                    <h4 class="font-medium text-gray-600">${subKey}</h4>
                                    <ul class="list-disc pl-5 space-y-1">
                                        ${(subValue as string[]).map(item => `<li class="text-gray-600">${item}</li>`).join('')}
                                    </ul>
                                </div>
                              `).join('')
                            : value
                    }
                </div>
            `).join('')}
        </div>
    </div>
`;

const generatePage = (page: z.infer<typeof FrontendSchema>) => {
    const dependencies = page.dependencies?.map(dep => 
        dep.endsWith('.css') ? 
            `<link rel="stylesheet" href="${dep}">` :
            `<script src="${dep}"></script>`
    ).join('\n    ') || '';

    const scripts = page.scripts?.map(script => 
        `<script>${script}</script>`
    ).join('\n    ') || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.name}</title>
    ${page.styles.tailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
    ${page.styles.css ? `<style>${page.styles.css}</style>` : ''}
    ${dependencies}
</head>
<body>
    ${page.content}
    ${scripts}
</body>
</html>`;
};

const generateIsolatedPage = (title: string, id: string) => `
<div class="page-container container mx-auto" data-page-id="${id}">

    <div class="w-full grid grid-subgrid row-span-2 col-span-2 grid-cols-2 items-center absolute top-0 right-0 sticky z-10 space-x-2 shadow">
        <span>${title}</span>

        <a id="${id}-link" href="/sse?type=${id}&url=https://agents.cfapps.us10-001.hana.ondemand.com/agents/dev/events" mode="dialog" >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
            </svg>
        </a>  
    </div>
    <embed id="${id}-iframe" src="/sse?type=${id}&url=https://agents.cfapps.us10-001.hana.ondemand.com/agents/dev/events" width="100%" height="100%" />
        
    <script>
        (() => {
            // const container = document.currentScript.parentElement;
            // const template = container.querySelector('template');
            // const shadowRoot = container.attachShadow({ mode: 'open' });
            // shadowRoot.appendChild(template.content.cloneNode(true));
            const link = document.querySelector('#${id}-link');
            link.href = link.href + window.location.href  + "/events";

            const iframe = document.querySelector('#${id}-iframe');
            iframe.src = link.href;
        })();
    </script>
</div>`;

export const machine = setup({
    actors: {} as Actors,
    types: {
        emitted: {} as AnyEventObject,
        input: {} as {
          path: string;
          agent: string;
          rev: string;
        },
        events: {} as z.infer<typeof RequirementsSchema> | z.infer<typeof ProductSpecSchema> | z.infer<typeof ArchitectureSchema> | z.infer<typeof UXDesignSchema> | z.infer<typeof PageSchema>,
        context: {} as {
            request?: string;
            clientRequirements?: z.infer<typeof RequirementsSchema>[];
            productSpec?:  z.infer<typeof ProductSpecSchema>[];
            architecture?: z.infer<typeof ArchitectureSchema>[];
            uxDesign?:  z.infer<typeof UXDesignSchema>[];
            implementation?:  z.infer<typeof ImplementationSchema>[];
            pages?: z.infer<typeof PageSchema>[];
        },
    },
}).createMachine({ 
    id: "website-generator",
    initial: "idle",
    context: ({ input }) => input,
    entry: emit({
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
    states: {
        idle: {
            on: {
                "request": {
                    target: "gatherRequirements",
                    actions: [
                        assign({
                            request: ({ event: { request } }) => request,
                        }),
                        emit(({ event: { request } }) => ({
                            data: `<div class="p-4 bg-white rounded-lg shadow-md">
                                <h2 class="text-xl font-semibold mb-2">Project Request</h2>
                                <p class="text-gray-700">${request}</p>
                            </div>`,
                            type: "request"
                        }))
                    ]
                }
            }
        },
        gatherRequirements: {
     
            invoke: {
                src: 'aiElementStream',
                id: "requirements",
                input: ({ context }) => ({
                    role: "Client Requirements Analyst", 
                    system: "Client Requirements Analyst, Analyze the request and create detailed business requirements for the project based on the customer request, maximum 3",
                    template: `request: """{{request}}"""`,
                    schema: RequirementsSchema ,
                    
                     
                    
                    
                }),
              
                onDone: {
                    target: "productPlanning",
                     
                }
            },
            on:{
                  "*": {
                     actions: [
                        assign({
                           clientRequirements: ({ event, context:{clientRequirements} }) => ([
                              ...(clientRequirements || []),event
                          ]),
                        }),
                         emit(({ event} ) => ({
                           data: renderArtifact("Client Requirements", event),
                           type: "content"
                         })) 
                     ]
                  }
                }
        },
        productPlanning: {
            invoke: {
                src: 'aiElementStream',
                input: ({ context }) => ({
                    role: "Product Manager",
                    system: "Create product specifications based on requirements, maximum 3",
                    template:  `client-requirements: """{{#clientRequirements}}
                       Type: {{type}}, Needs: {{needs}}, Wants: {{wants}} 
                    {{/clientRequirements}}"""`,
                    schema: ProductSpecSchema,
                    
                }),
                onDone: {
                    target: "uxDesign",
                   
                }
            },
          on: {
                "*": {
                    actions: [
                       assign({
                          productSpec:  ({ event, context:{productSpec} }) => ([
                            ...productSpec || [],
                            event
                          ])
                        }),
                        emit(({ event }:{event:z.infer<typeof ProductSpecSchema>}) => ({
                          type: "content",
                          data: renderArtifact("Product Specification", event)
                        }))
                    ]
                }
            }
        },
       
        uxDesign: {
            invoke: {
                src: 'aiElementStream',
                input: ({ context }) => ({
                    role: "UX Designer",
                    system: "Create an UX design based on the product specifications, maximum 3",
                    template: `product-spec: """{{#productSpec}} 
                          {{title}}:
                              type:{{type}}, priority:{{priority}}
                              description: """{{description}}""" 
                          --------------------------------
                        {{/productSpec}}"""`, 
                    schema: UXDesignSchema,
                  
                }),
                onDone: {
                    target: "implementation"
                }
            },
            on: {
                "*": {
                    actions: [
                        assign({
                            uxDesign:  ({ event, context:{uxDesign} }) => ([
                                ...uxDesign || [],
                                event
                            ])
                        }),
                        emit(({ event }) => ({
                            data: renderArtifact("UX Design", event),
                            type: "content"
                        }))
                    ]
                }
            }
        },
       architecture: {
            invoke: {
                src: 'aiElementStream',
                input: ({ context }) => ({
                    role: "Solution Architect",
                    system: "Create an architecture design based on the product specifications, maximum 3",
                    template: `product-spec: """{{#productSpec}} 
                          {{title}}:
                              type:{{type}}, priority:{{priority}}
                              description: """{{description}}""" 
                          --------------------------------
                        {{/productSpec}}"""`,
                    schema: ArchitectureSchema,
                    
                }),
                onDone: {
                    target: "implementation",
                    
                }
              },
              on: {
                "*": {
                    actions: [
                        assign({
                            architecture:  ({ event, context:{architecture} }) => ([
                                ...architecture || [],
                                event
                            ])
                        }),
                        emit(({ event }) => ({
                            data: renderArtifact("Architecture", event),
                            type: "content"
                        }))
                    ]
                }
            }
        },
        implementation: {
            invoke: {
                src: 'aiElementStream',
                input: ({ context }) => ({
                    role: "System Developer",
                    system: "Create an implementation based on the  UX design, and product specifications, maximum 3",
                    prompt: `Product Specification: ${JSON.stringify(context.productSpec)}
                     UX Design: ${JSON.stringify(context.uxDesign)}   `, 
                    schema: ImplementationSchema
                    
                }),
                onDone: {
                    target: "frontend" 
                }
            },
            on: {
                "*": {
                    actions: [
                        assign({
                            implementation:  ({ event, context:{implementation} }) => ([
                                ...implementation || [],
                                event
                            ])
                        }),
                        emit(({ event }) => ({
                            data: renderArtifact("Implementation", event),
                            type: "content"
                        }))
                    ]
                }
            }
        },
        frontend: {
            entry: [
                emit({
                    type: "content",
                    data: `<div class="p-4 bg-white rounded-lg shadow-md">
                        <h2 class="text-xl font-semibold mb-2">Frontend Generation Phase</h2>
                        <p class="text-gray-700">Generating frontend code based on implementation and design...</p>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr" sse-swap="pages" hx-swap="beforeend transition:true">
                        </div>
                       
                    </div>` 
                })
            ],
            invoke: {
                src: 'aiElementStream',
                id: "frontend",
                input: ({ context }) => ({
                    prompt: `You are a frontend developer that generates HTML pages based on implementation details and UX design.
                            Implementation: ${JSON.stringify(context.implementation)}
                            UX Design: ${JSON.stringify(context.uxDesign)}
                            Product Specification: ${JSON.stringify(context.productSpec)}
                            Requirements:
                            - Generate responsive pages that work well on all screen sizes
                            - Include appropriate meta tags and viewport settings
                            - If using images or other assets, include them in the HTML with available URLs
                            - Keep the design simple and clean as a prototype
                            - Maximum 3 pages per generation
                            - Each page should have a unique ID and path`,
                    schema: PageSchema
                }),
                onDone: {
                    target: "complete"
                }
            },
            on: {
                 "page": {
                     actions: [  
                        assign({
                            pages: ({ event, context: { pages } }) => {
                                const pageId = event.id || event.title.replace(/\s+/g, '-').toLowerCase();
                                return [
                                    ...(pages || []),
                                    { ...event, id: pageId }
                                ];
                            }
                        }),
                        emit(({ event: { type, title, outerHtml, id }, context: { pages , path} }) => {
                            const pageId =`page.${ id || title.replace(/\s+/g, '-').toLowerCase()}`;
                            return {
                                data: `<a id="${id}-link" href="/sse?type=${pageId}&url=https://agents.cfapps.us10-001.hana.ondemand.com${path}/events" mode="dialog" >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
            </svg>
        </a>  `,
                                type: 'pages',
                                defer: 50
                            };
                        }),
                        emit(({ event: { type, title, outerHtml, id }, context: { pages } }) => {
                            const pageId =`page.${ id || title.replace(/\s+/g, '-').toLowerCase()}`;
                            return {
                                data: outerHtml,
                                type: pageId,
                                defer: 500
                            };
                        }),
                     
                    ]
                     } 
                }
            },
        complete: {
            type: "final"
        }
    }
});

export default machine;
