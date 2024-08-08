import { z } from 'zod';
import 'atomico/ssr/load';

import {setup, createActor, assign, sendTo, EventObject, spawnChild, enqueueActions, ActorRefFrom} from 'xstate';
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {html} from "atomico";
 import {Doodle} from "../doodles";
import {fromGenerateObject, fromToolStream, fromTextStream, fromAiStreamText} from "../utils/toolStream";
import {findDoodleTool} from "../doodles/embedded";
import {render, renderActor, renderCallbackActor, StreamActorLogic} from "../ui/render";
import {SVG} from "../ui/components/svg";
import {VNodeAny} from "atomico/types/vnode";
import {Streamable} from "../ui/components/streamable";
import {spawn} from "node:child_process";
import {TextStream} from "../ui/components/text";
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
        renderer: undefined as unknown as renderCallbackActor, 
    },
    types: {
        input: {} as {
            thought?: string;
            doodle?: Doodle;
         },
        context: {} as {
            thought?: string;
            doodle?: Doodle;
         }
    }
}).createMachine({ 
    initial: 'thinking',
     context:({ input})=> input,
    states: {  
        thinking: { 
            entry: spawnChild('renderer',{
                id: `thought`,
                syncSnapshot: false,
                input: {
                    slug: '/thought',
                    html(h) {
                        return  h`<div> <pre>User:<span>Think about a random topic, and then share that thought.</span></pre>
                                         Agent: <${TextStream} url="thought" />
                               </div>`
                    }
                }
            }),  
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
                            enqueue.sendTo('thought', {
                                type: 'render',
                                node: html`${thoughtDelta}` 
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
            entry: spawnChild('renderer', {
                id: `doodle`,
                syncSnapshot: false,
                input: {
                    slug: '/doodle',
                    html(h) {
                        return h`<${Streamable} url="doodle" > </${Streamable}>`
                    }
                }
            }),
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
                                enqueue.sendTo('doodle', {
                                    type: 'render',
                                    node: html`<${SVG} src="${doodle?.src}" alt="${doodle?.alt}"/>`
                                })
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
