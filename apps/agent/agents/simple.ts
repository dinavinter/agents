import { z } from 'zod';
import 'atomico/ssr/load';

import {setup, createActor, assign, sendTo, EventObject, spawnChild, enqueueActions, ActorRefFrom} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {html} from "atomico";
 import {Doodle} from "../doodles";
import {fromGenerateObject, fromToolStream, fromTextStream, fromAiStreamText} from "../utils/toolStream";
import {findDoodleTool} from "../doodles/embedded";
import {renderActor, renderCallbackActor, StreamActorLogic} from "../ui/render";
import {SVG} from "../ui/components/svg";
config();
 

export const machine = setup({
    actors: { agent: fromGenerateObject() ,
        aiStream:fromAiStreamText({
            model: openaiGP4o(),
            temperature: 0.9
        }),
        text:fromTextStream( {
            model: openaiGP4o(),
            temperature: 0.9
        }),
        
        doodle: fromToolStream({
            model: openaiGP4o(),
            temperature: 0.9
        }),
        stream: undefined as unknown as StreamActorLogic,
        render: undefined as unknown as renderActor, renderer: undefined as unknown as renderCallbackActor, 
    },
    types: {
        input: {} as {basePath:string, streamPath: (stream:string) => string},
        context: {} as {
            thought?: string;
            doodle?: Doodle;
            basePath:string, streamPath: (stream:string) => string
            stream:  ActorRefFrom< StreamActorLogic>;
        },
    },
}).createMachine({ 
    initial: 'thinking',
    invoke:{
        src: 'renderer',
        id: 'renderer',
        systemId: 'renderer',
    }, 
    context:({ spawn, input})=> ({
        ...input,
        stream:  spawn('stream', {
            id: `thought`,
            systemId: `thought`,
            syncSnapshot: false
        })
    }),
    states: {  
        thinking: {
            entry: sendTo('renderer',({ context:{streamPath}}) => ({
                    type: 'render',
                    node: html`
                        <host>
                            <span>I'm thinking about a random topic</span>
                            <br/>
                            <c-text-stream url="${streamPath('thought')}" default="...">
                                <span slot="default">...</span>
                            </c-text-stream>
                        </host>`
                })),
            invoke: {
                src: 'text',
                input:'Think about a random topic, and then share that thought.',
                onSnapshot: {
                     actions: enqueueActions(({enqueue,event})=> {
                        const thoughtDelta = event.snapshot.context; 
                        if(thoughtDelta !== undefined){ 
                            enqueue.assign({
                                thought: ({context:{thought}}) =>  thought? thought + thoughtDelta : thoughtDelta
                            }) 
                            
                            enqueue.sendTo('thought',{
                                type: 'event',
                                data: thoughtDelta
                            })
                        } 
                    })
                },
                onDone: { 
                    target: 'doodle' 
                }
                
            }
        },
        doodle: {
            invoke: {
                src: 'doodle',
                input: {
                    template: `search for a doodle that describes the thought {thought}`,
                    tools: {
                        doodle: findDoodleTool 
                    } 
                },
                onSnapshot: {
                     actions: enqueueActions(({enqueue,check,event})=> {
                            const doodle = event.snapshot.context; 
                            if(doodle !== undefined){
                                enqueue.assign({
                                    doodle: event.snapshot.context
                                })
                                enqueue.sendTo('renderer', () => ({
                                    type: 'render',
                                    node: html`<${SVG} src="${doodle?.src}" alt="${doodle?.alt}"/>`
                                }))
                            }
                           
                        })
                },
                onDone: {
                    target: 'done'
                }
            },
        },
        done: {
            type: 'final',
            output: ({context}) => context
        }
    },
});
 
export function create( create?: typeof createActor<typeof machine>) {
  const actor = (create || createActor)(machine);
  console.log('create actor', actor.id)
    //log stack trace
    console.log(new Error().stack)
    return actor;
        
}

export default create

// keep the process alive by invoking a promise that never resolves


//<!--        <dotlottie-wc src="https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie" autoplay loop></dotlottie-wc>-->
