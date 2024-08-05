//state machine to read repository, analyze each image in a folder , and persist the image with the alt in index json file
import {
    assign, createActor,
    createMachine, DoneActorEvent, fromPromise
} from "xstate";
import type {PromiseActorLogic
    } from "xstate";
import {getRepoFiles, GithubContentFile, GithubLoaderParams} from "../git";
import {openaiGP4o} from "../providers/openai";
import {  streamText} from "ai";
import {env} from "node:process";
import fs from "node:fs";

type File= Pick<GithubContentFile, "src" | "path"> &   {  description?:string }
type Analysis = File &   { description:string }
  
type GithubSource = GithubLoaderParams;
type Output= {
    src: string;
    alt: string; 
}[]
     
 
export const config =   createMachine({
    id: 'image-alt',
    initial: 'reading',
    types: {
        input:  {} as { source: GithubSource; files?: Record<string, File>},
        context: {} as { source: GithubSource; files: Record<string, File>},
        output: [] as Output,
        actors: {} as {
            logic: PromiseActorLogic<Record<string, File>, GithubSource>;
            src: 'puller';
        } | {
            src: 'analyze';
            logic: PromiseActorLogic<Analysis,File>;
        } 
    },
    context: ({input})=>({
        files: {} as Record<string, File>,
        ...input as { source: GithubSource; files?: Record<string, File>}
    }),
    states: {
        reading: { 
            invoke: {
                src: 'puller',
                input: ({context}) => context.source, 
                onDone: {
                    target: 'analyzing',
                    actions: assign({
                        files: ({event}) => event.output 
                    }) 
                }
            }
        }, 
        analyzing: {
            initial: 'looping',
            states:{
                looping: {
                    always: [{
                        target: 'analyzing',
                        guard: ({context, event}) => Object.values(context.files).filter(f =>  !f.description).length > 0
                    },{
                        target: '#done',
                        guard: ({context, event}) => Object.values(context.files).filter(f =>  !f.description).length === 0  
                    }]
                },
                analyzing: {
                    invoke: {
                        src: 'analyze',
                        id: 'analyzer',
                        systemId: 'analyzer',
                        input: ({context}) => Object.values(context.files).filter(f =>  !f.description)[0] ,
                        onDone: {
                            target: 'looping',
                            actions: assign({
                               files: ({context, event :{output: {description, path,src}}}) => ( {
                                   ...context.files,
                                   [path]:{
                                       path,
                                       src,
                                       description
                                   }
                               })
                            })
                        }
                    }
                }
            }

        },
        
        done:{
            id:"done",
            type: 'final',
            output: ({context}) => 
                Object.values(context.files).map(({path, src, description}) => ({
                    alt: description,
                    src: src
                }))
        }
    }
  
});

 

const machine= config.provide({
    actors: {
        puller: fromPromise(async function read({input:options}) {
            const files=  await getRepoFiles(options)  
            return files
                .filter(f => f.path.endsWith('.png') || f.path.endsWith('.jpg'))
                .slice(0, 5)
                .reduce((acc, file) => {
                    acc[file.path] = file;
                    return acc;
                }, {} as Record<string, File> )
        }),  
        analyze:fromPromise(async function analyze({input:{src,path}}) {  
                 const {textStream} = await streamText({
                    model: openaiGP4o(), 
                    system: "your role is to extract image characteristics from the image inputs.",
                    messages: [{
                        role: "user",
                        content: [{
                            type: "text",
                            text: "Analyze the image and provide a description of the image."
                        },{
                            type: 'image',
                            image: src
                        }]
                    }]
                })
                
            let description = ''
               for await (const event of textStream) {
                    console.log("event: ", event);
                    description += event;
                }

                return {
                    src,
                    description,
                    path
                } 
        }) 
    }
})

export function create( create?: typeof createActor<typeof config>) {
    const actor= (create ?? createActor)(machine, {
        input: {
            source: {
                repo: "MariaLetta/mega-doodles-pack",
                branch: "master",
                recursive: true,
                accessToken:env.GITHUB_TOKEN,
                ignorePaths: ["preview", "doodles/svg"]
            }
        }
    })
    
    actor.subscribe({
        complete(){
           fs.writeFileSync("doodles/doodles.json" , JSON.stringify( actor.getPersistedSnapshot().output, null, 2))
        }
    })
    return actor;
}

export default create
 
