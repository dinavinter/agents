
//state machine to load tests from github repo and analyze them, creating a json file with the tests, can be used to create a vector database your tests
// NOTE: Works with fs, and github api requires GITHUB_TOKEN to be set in the environment variable
// NOTE: does not work with ui yet
import {
    ActorLogic, 
    assign,fromPromise, setup
} from "xstate";
import {openaiGP4o} from "../ai";
import {streamObject} from "ai";
import {env} from "node:process";
import fs from "node:fs";
import {fromAsyncGenerator} from "../stream";
import {z} from "zod";

type Test = {
    name: string;
    usecase: string;
    src: string;
    code: string;
    apis: string[];
    tags: string[];
    flow: string;
    dependencies: string[];
    category: string[];
    loc:{
        start: number;
        end: number;
    }
    type: "test";
    path: string;
    attributes: string[];
}


export type GithubLoaderParams = {repo: string, branch: string, accessToken?: string}
export type GithubContentFile =  {url:string , path:string,  src:string; branch: string, repo: string}

    
type File= Pick<GithubContentFile, "src" | "path"> &   {  tests:Test[],  done?: boolean , state: "pending" | "analyzing" | "done" | "error" }
 
type GithubSource = GithubLoaderParams;
 

 


const analyzer=fromAsyncGenerator(async function * analyze({input:{src,path}}:{input:{src:string, path:string} & any}) {
    const sourceBuffer = await  fetch(src);
    const sourceCode = sourceBuffer.toString();
    const {elementStream} = await streamObject({
        output: 'array',
        model: openaiGP4o(),
        prompt: 'your role is to extract tests from the following code ```cs`' + sourceCode + '```',
        schema:  z.object( {
            name: z.string().describe('The name of the test'),
            usecase: z.string().describe('The test use case explained in few sentences'),
            apis: z.array(z.string()).describe('The apis involved  in the test'),
            flow: z.string().describe('The test flow in  few words'),
            tags: z.array(z.string()).describe('Tags that will help to with search queries on the tests'),
            category: z.array(z.string()).describe('The categories of the tests' ),
            attributes: z.array(z.string()).describe('The attributes of the test'),
            loc: z.object({
                start: z.number().describe('The start row location of the test'),
                end: z.number().describe('The end row location of the test'),
            }),
            dependencies: z.array(z.string()).describe('The dependencies of the test'),
        })
    });
    for await (const part of elementStream) {
        yield {
            ...part,
            code:sourceCode.slice(part.loc.start, part.loc.end),
            src,
            path,
            type: 'test'
        }
    }
})

const withFsPersistence=<TInput extends {"$persistent"?: string}, T extends  ActorLogic<any, any, TInput>> (actor: T, path?: string ):T => {
    fs.mkdirSync("tests", {recursive: true})

    const transition = actor.transition.bind(actor);
    const getInitialSnapshot = actor.getInitialSnapshot.bind(actor);
    let pathToPersist: string = path || "./index.json";
    actor.getInitialSnapshot = function (actorCtx, input) {
        pathToPersist = input?.["$persistent"] ?? pathToPersist;
        
        // fs.mkdirSync(pathToPersist, {recursive: true});
        if (fs.existsSync(pathToPersist)) {
            return JSON.parse(fs.readFileSync(pathToPersist, 'utf-8'));
        }
        const snapshot= getInitialSnapshot(actorCtx, input);
        fs.writeFileSync(pathToPersist, JSON.stringify(snapshot, null, 2));
        return snapshot;
    }
    actor.transition = function (state, event, actorCtx) {
        const result = transition(state, event, actorCtx);
        fs.writeFileSync(pathToPersist, JSON.stringify(result, null, 2))
        return result;
    }
     return actor;
}




export const machine= setup({
    types: {
        context: {} as {files: Record<string, File> ; source: GithubSource; processing: File},
    },
    actors: {
        puller: fromPromise<Record<string, File>, GithubSource>(async function read({input: options}) {
            const files = await getRepoFiles(options)
            return files
                .filter(f => f.path.endsWith('.cs'))
                .reduce((acc, file) => {
                    acc[file.path] = {
                        ...file,
                        state: "pending",
                        tests: [],
                        done: false
                    };
                    return acc;
                }, {} as Record<string, File>)
        }),
        analyzer:    withFsPersistence(analyzer)
    }
}).
createMachine({
    initial: 'init',
    context: ({input}) => ({
        files: {},
        processing: undefined as unknown as File,
        source: {
            repo: "dinavinter/umtests",
            branch: "main",
            recursive: true,
            accessToken: env.GITHUB_TOKEN
        },
        ...(input as { source?: GithubSource; files?: Record<string, File> } || {})
    }),
    states: { 
        init: { 
            invoke: {
                src: 'puller',
                input: ({context}) => context.source,
                onDone: {
                    target: 'paging',
                    actions: [
                        ({event: {output}}, params) => fs.writeFileSync("tests/index.json", JSON.stringify(output, null, 2)),
                        assign({files: ({event: {output}}) => output})
                    ]
                },

            }
        },
        paging: {
            initial: 'looping',
        

            states: {
                
                looping: {
                    entry: assign({
                        processing: ({context}) => Object.values(context.files).filter(f => f.state === "pending")[0]
                    }),
                    always: [{
                        target: '#done',
                        guard: ({context:{processing,files}}) => Object.values(files).filter(f => f.state === "pending").length === 0
                    }, {
                        target: 'executing',
                        guard: ({context}) => Object.values(context.files).filter(f => f.state === "pending").length > 0
                    }
                    ]
                },
                executing: {
                    invoke: {
                        src: 'analyzer',
                        id: 'analyzer',
                        systemId: 'analyzer',
                        // @ts-ignore
                        input: ({context}) => {
                            const {src, path} = context.processing!;

                            return { src: src,
                            path: path, 
                            "$persistent": `./tests/${path?.replace('/', '-')}.json`
                        }},
                        onDone: {
                            target: 'looping',
                            actions: assign({
                                files: ({context}) => ({
                                    ...context.files,
                                    [context.processing!.path]: {
                                        ...context.files[context.processing!.path],
                                        done: true
                                    }
                                })
                            })
                        }
                    }
                }
            }
        },
        done: {
            id: 'done',
            type: 'final',
            entry: [({context}) => console.log("done", context.files)],
            output: ({context}) => context.files
        }
    }
})




export async function getRepoFiles({repo,branch, accessToken}: GithubLoaderParams):Promise<GithubContentFile[]> {
    let url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json'
    };

    const response = await fetch(url, { headers }) ;
    if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
    }
    const json = await  response.json()   as {tree: {
            type: string,
            path: string,
            url: string
        }[]};
    const files = json.tree.filter((file) => file.type === 'blob' );
    return files.map((file) => ({
        ...file,
        branch, repo,
        src:`https://raw.githubusercontent.com/${repo}/${branch}/${file.path}`,
    }));
}


