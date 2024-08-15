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
import {render, RenderStream} from "../ui/render";
import {asyncEventGenerator,asyncBatchEvents,type Clonable, cloneable,filterEventAsync} from "../stream";
  
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
        <div slot="template">
            <pre><h2>The task:</h2> Think about a random topic, and then share that thought.</pre>
            <div>
                <${stream.event("thought").text} /> 
                <slot></slot>
                <div  style="height: 10rem; display: flex; flex-wrap: wrap;"> 
                    <slot name="doodle"></slot>
                </div>
            </div> 
        </div>`
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
                    template: `search for a doodle that describes the following thought, be creative and find a new doodle every time, history: {{doodle}}, the thought is """{{#batch}}{{textDelta}}{{/batch}}"""`,
                    type: 'batch',
                    tools: {
                        doodle: findDoodleTool
                    }
                }
            }, 
            on: {
                'text-delta': {
                    actions: emit(({event: {textDelta}}) => ({type: 'thought', data: textDelta})),
                },
                'tool-result': {
                    actions: [
                        assign({
                            doodle: ({context: {doodle}, event: {result}}) => [...doodle, result]
                        }),
                        render(({event: {result: {src, alt}}, html}) => html`
                            <${SVG} src="${src}" alt="${alt}" slot="doodle"  style="height: 2rem; width: 1.5rem; display: inline;"/>
                        `),
                    ],
                 },
                "batch": {
                    actions: forwardTo("doodle")
                }
            }
                 
        }
 
    }
});

export function create(create?: typeof createActor<typeof machine>) {
    const actor = (create || createActor)(machine);
    console.debug('create actor', actor.id)
    return actor;

}

export default create

 