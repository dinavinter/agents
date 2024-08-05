import { z } from 'zod';
import {setup, createActor, assign, sendTo, EventObject} from 'xstate';
import {createAgent, fromDecision} from "@statelyai/agent";
import {openaiGP4o} from "../providers/openai.js";
import {config} from 'dotenv';
import {renderActor, renderCallbackActor} from "../render";
import {html} from "atomico";
import {Anime} from "../anime";
import {GithubRepoLoader} from "@langchain/community/document_loaders/web/github";
config();

 
const agent = createAgent({
    name: "simple-agent",
    model: openaiGP4o() ,
  
    events: {
        'agent.thought': z.object({
            text: z.string().describe('The text of the thought'),
            animation:z.object({
                viewBox:z.string().describe('The viewBox of the svg'),
                options: z.object({
                    targets:z.string().describe('The target of the animation, css selector'),

                    // easing:z.string().describe('The easing of the animation'),
                    duration:z.number().describe('The duration of the animation'),
                    direction:z.string().optional().describe('The direction of the animation'),
                    // keyframes:z.array(z.object({
                    //     value: z.string().describe('The value of the keyframe'),
                    //     easing: z.string().describe('The easing of the keyframe'),
                    //     offset: z.number().describe('The offset of the keyframe'),
                    //     duration: z.number().describe('The duration of the keyframe'),
                    //     targets: z.string().describe('The targets of the keyframe, css selector'),
                    // })).describe('The keyframes of the animation'),
                    
                }).describe('The options of the animation to pass to animejs'),
                geometry:z.object({
                    fill: z.string().describe('The fill of the svg'),
                    fullRule: z.string().describe('The fill-rule of the svg'),
                    stroke: z.string().describe('The stroke of the svg'),
                    strokeWidth: z.number().describe('The stroke-width of the svg'),

                    paths: z.array(z.object({
                        d: z.string().describe('The d attribute of the path'),
                        fill: z.string().describe('The fill attribute of the path'),
                        strokeDasharray: z.string().optional().describe('The stroke-dasharray attribute of the path'),
                        strokeDashoffset: z.string().optional().describe('The stroke-dashoffset attribute of the path'),
                        stroke: z.string().optional().describe('The stroke attribute of the path'),
                        strokeWidth: z.number().optional().describe('The stroke-width attribute of the path'),
                        style: z.string().optional().describe('The style attribute of the path'),
                    })).describe('The paths of the svg'),
                    
                })

            }).describe('An svg animation to describe the thought in a visual way'),
                }) 
    }
});

export const machine = setup({
    actors: { agent: fromDecision(agent) , render: undefined as unknown as renderActor, renderer: undefined as unknown as renderCallbackActor},
    types: {
        events: agent.types.events,
        context: {} as {
            thought: string;
            animation: z.infer<typeof agent.events['agent.thought']>['animation']
        },
    },
}).createMachine({
    initial: 'thinking',
    invoke: {
        src: 'renderer',
        id: 'renderer',
        systemId: 'renderer',
    },
    
    context: {
        thought: '',
        animation: {} as z.infer<typeof agent.events['agent.thought']>['animation']
    },
    states: {
        thinking: {
            entry: sendTo('renderer', {
                type: 'render', 
                node: html`<host><span>I'm thinking about a random topic</span>
               
                </host>`
            }),
            invoke: [{
                src: 'agent',
                input: 'Think about a random topic, and then share that thought.',
            }],
            on: {
                'agent.thought': {
                    actions: assign({ 
                        thought: ({ event } ) =>event.text ,
                        animation: ({ event }: {event:typeof agent.types.events}) =>event.animation
                    }),
                    target: 'thought',
                },
            },
        },
        thought: {
            entry: sendTo('renderer',  ({context:{thought, animation:{
                geometry:{paths, ...geometry}, options, viewBox
            }}}:{context:any}) =>({
                type: 'render', 
                node: html`
                       <host><span> Thought: ${thought} </span>
                           <pre>${JSON.stringify({
                               geometry,
                               options,
                               viewBox,
                               paths
                           })}</pre>
                           <dotlottie-wc src="https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie" autoplay loop></dotlottie-wc>
                          
                       </host>
                    `,
                    anim:html` <${Anime } targets=".lines path" 
                                       easing="easeInOutElastic" 
                                       duration=${options.duration} 
                                       direction="alternate"
                                       loop="true"
                                       ...${options}>

                                <svg viewBox="${viewBox}" >
                                   <g  ...${geometry}>
                                      ${paths.map(({d, fill, ...path}) =>
                        html`<path d=${d} fill=${fill} ...${path}></path>`)
                    }
                                   </g>
                               </svg>
                           </${Anime}>`
            }) ) 
        }
    },
});
// <!--                                   fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="1" class="lines"-->

export function create( create?: typeof createActor<typeof machine>) {
    return (create ?? createActor)(machine)
}

export default create

// keep the process alive by invoking a promise that never resolves


