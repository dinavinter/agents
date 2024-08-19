import {
    assign,
    createActor,
    emit, forwardTo,
    fromPromise,
    setup,
    spawnChild,
} from 'xstate';
import {openaiGP4o,fromAIEventCallback} from "../ai";
import {config} from 'dotenv';
import {Doodle, findDoodleTool} from "../ui/doodles";
import {streamText, StreamTextResult, TextStreamPart} from "ai";
import {SVG} from "../ui/components/svg";
import {render, renderTo, RenderStream, Html} from "../ui/render";
import {asyncEventGenerator,asyncBatchEvents,type Clonable, cloneable,filterEventAsync} from "../stream";
import {html} from "atomico";
  
config();
 

export const machine = setup({

    actors: { 
        aiCallback:  fromAIEventCallback({
            model: openaiGP4o(),
            temperature: 0.9,
            maxToolRoundtrips: 1 
        }), 
        stream:asyncEventGenerator,
        batch:  asyncBatchEvents
    },
    types: {
         input: {} as {
            stream?: RenderStream,
            doodle?: Doodle[];
        },
        context: {   } as {
            stream?: RenderStream,
            thought?:  Clonable<AsyncIterable<TextStreamPart<any>>>;
            doodle: Doodle[];
        }
    }
}).createMachine({
    initial: 'thinking',
    context: ({input}) => {
        return {
            doodle: [],
            ...input
        }
    }, 
    meta: {
        render: ({stream,html}:{stream:RenderStream, html:Html}) => html`
            <main class="mx-auto  bg-slate-50 h-screen w-full flex flex-row">
                <div class="mt-4 shadow-md flex flex-col">
                    <header class="bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                        <pre class="text-pretty shadow-sm  text-slate-400">Think about a random topic, and then share that thought.</pre>
                    </header>
                    <${stream.event("thought").text} class="flex-grow"/>
                </div>

                <div class="mt-4 has-[svg]:block  shadow-md flex flex-col">
                    <header class="bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                        <pre class="text-pretty shadow-sm  text-slate-400">Doodle it</pre>
                    </header>
                    <${stream.event("doodle").html} >
                        <div class="doodle" slot="template"
                             style="height: 15rem; display: flex; flex-wrap: wrap; gap: 4px; vector-effect: non-scaling-stroke; object-fit: contain">
                            <slot/>
                        </div>
                    </${stream.event("doodle").html} class="flex-grow">
                </div>
            </main>
        `},
            
    // entry: render(({html,stream}) => html`
    //     <div slot="template">
    //         <pre>Think about a random topic, and then share that thought.</pre>
    //            <div>  
    //                <${stream.event("thought").text} />
    //                <${stream.event("doodle").html} >
    //                    <div slot="template" style="height: 15rem; display: flex; flex-wrap: wrap; gap: 4px; vector-effect: non-scaling-stroke; object-fit: contain" >
    //                        <slot />
    //                    </div>
    //                </${stream.event("doodle").html} >
    //            </div> 
    //      </div>`
    // ), 

    states: {
        thinking: { 
            invoke: {
                src: fromPromise<StreamTextResult<any>>(async () => {
                    return await streamText({
                        model: openaiGP4o(),
                        prompt: 'Think about a random topic, and then share that thought.', 
                    }) satisfies StreamTextResult<any>;
                }),
                onDone: {
                    target: 'thought',
                    actions: assign({
                        thought: ({event: {output}}) => {
                            const {fullStream} = output as StreamTextResult<any>;  
                            return cloneable(fullStream);
                        }
                    })
                } 
            }
        },
        thought:{ 
            entry: [ 
                spawnChild("stream", { 
                    input: ({context:{thought}}) => thought!.clone(),
                    id: 'full' ,
                    systemId:'full',
                    syncSnapshot: true
                }),   
                spawnChild("batch", {
                         input: ({context:{thought}}) =>( {
                             stream: filterEventAsync(thought!.clone(), "text-delta"),
                             split: (e:any) => e.textDelta.includes(".") || e.textDelta.includes(",")
                         }),
                        syncSnapshot: true
                }),
                
             ],
            invoke: {
                id: 'doodle',
                src: 'aiCallback', 
                input: {
                    template: `search for a doodle that describes the following thought, make sure to find different doodles then the ones in history.
                                history:"""{{#history}}"{{tools.doodle.args.query}}",{{/history}}"""
                                thought: """{{#batch}}{{textDelta}}{{/batch}}"""`,
                    type: 'batch',
                    tools: {
                        doodle: findDoodleTool
                    }
                }
            }, 
            on: {
                'text-delta': {
                    actions: emit(({event: {textDelta}}) => ({
                        type: 'thought',
                        data: textDelta
                    }))
                },
                'tool-result': {
                    actions: renderTo('doodle', ({event: {result: {src, alt}}}) => html`
                        <${SVG} src="${src}" alt="${alt}" style="height: 4rem; width: 4rem; display: inline;"/>
                    `)
                },
                "batch": {
                    actions: forwardTo("doodle")
                }
            }
                 
        }
 
    }
});



 