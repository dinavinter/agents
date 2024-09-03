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
import {Doodle, findDoodleTool} from "../doodles";
import {streamText, StreamTextResult, TextStreamPart} from "ai";
import {SVG} from "../components";
import {render, renderTo, RenderStream} from "./agent-render";
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
 
            
    entry: render(({html,stream}) => html`
                <main class="mx-auto  bg-slate-50 h-screen w-full">
                    <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                        The Wiser
                    </header>
                    <pre class="text-pretty shadow-sm  text-slate-400">Think about a random topic, and then share that thought.</pre>

                    <div class="flex flex-col-reverse items-center justify-center *:w-2/3 *:justify-center"> 
                        <div ...${stream.connect({event:"doodle", swap:"afterbegin transition:true settle:1s"})} style="height: 15rem; display: flex; flex-wrap: wrap; gap: 4px; vector-effect: non-scaling-stroke; object-fit: contain" />
                        <pre ...${stream.connect({event:"message", swap:"beforeend  settle:2s"})} class="flex-grow text-pretty   "/>  
                    </div> 
                </main>
        `
    ), 

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
                        <${SVG} src="${src}" alt="${alt}" style="height: 8rem; width: 8rem; display: inline;"/>
                    `)
                },
                "batch": {
                    actions: forwardTo("doodle")
                }
            }
                 
        }
 
    }
});



 