//Note: working on the pinecone database, requires the pinecone api key to be set in the environment variable PINECONE_API_KEY
import { Pinecone } from "@pinecone-database/pinecone";
import {  embed, tool} from "ai";
import {z} from "zod";
import {embedding, fromAIEventStream, openaiGP4o} from "../ai";
import {  setup} from "xstate";
import {render,   renderTo} from "./agent-render";
import * as fs from 'fs';
import {html} from "atomico";
import {env} from "node:process";
 

const pc = new Pinecone({
    apiKey: env.PINECONE_API_KEY!,
    fetchApi: fetch
});
const index = pc.index('test');

const ns =index.namespace("( Default)");

async function all<T>(array: Promise<T>[]) {
    const results = [];
    for (const promise of array) {
        results.push(await promise)
    }
    return results;
}

export const searchTestsTool =tool({
    description: 'Search for existing tests and api usage',
    parameters: z.object(({
        query:  z.array(z.string().describe('a query to search for'))
    })),
    async execute({query}) {
        try {
            console.log('query', query)
            const queryEmbedding =await all(query.map(a=>  embed({
                model: embedding(),
                value: a,
            }).then(({embedding})=> Array.from(embedding.values()) )));
            const model = 'multilingual-e5-large';

            async function generateDocEmbeddings() {
                try {
                    const list = await pc.inference.embed(
                        model,
                        query,
                        {inputType: 'query', truncate: 'NONE'}
                    );

                    return list.data.map((a: any) => a.values);
                } catch (error) {
                    console.error('Error generating embeddings:', error);
                    throw error;
                }
            }


            async function* getResults() {
                // const embeddings = await generateDocEmbeddings();
                for (const embed of queryEmbedding) {
                    const result = await index.query({
                        topK: 2,
                        vector: embed,
                        includeValues: true,
                        includeMetadata: true
                    })

                    for (const match of result.matches) {
                        yield {
                            match,
                            content: match.metadata && fs.readFileSync(`/Users/I347305/Src/umtests/Tests/${match.metadata.text}`)
                        };
                    }
                }
            }

            let results = [];
            for await (const result of getResults()) {
                results.push(result);
            }
            return results;
        }
        catch (e) {
            console.error('Error searching tests', e);
        }
        
    }
})

const set= setup({
        actors: {
            aiStream: fromAIEventStream({
                model: openaiGP4o(),
                temperature: 0.5
            })
        }
    }
)
export const machine = set.createMachine({
    id: 'testGenerator',
    initial: 'generate',
    
    context: {
        request: 'social registration and link accounts',
    },
    entry: render(({html}) => html`
        <main class="mx-auto  bg-slate-50 h-full">
            <header class="sticky top-0 z-10 backdrop-filter backdrop-blur bg-opacity-30 border-b border-gray-200 flex h-6 md:h-14 items-center justify-center px-4 text-xs md:text-lg font-medium sm:px-6 lg:px-8">
                <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">Tests</span>
                <span class="text-sm  lg:text-lg font-normal text-gray-500 dark:text-gray-400">${new Date(Date.now()).toLocaleTimeString()}</span>
            </header> 
            <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse"
                 sse-swap="content" hx-swap="beforeend" />
             <div class="flex flex-col items-center justify-center *:w-1/2 *:justify-center" hx-ext="sse" sse-swap="test" hx-swap="beforeend" />
        </main>
    `),
    states: {
        generate: {
            entry: renderTo('content', ({html}) => html`
                <div class="leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl dark:bg-gray-700 flex-grow ">
                    <pre class="text-lg text-slate-900 inline text-wrap" sse-swap="@generate.text-delta" />
                </div>`),
               
            invoke: {
                src: 'aiStream',
                id: 'generate',
                systemId: 'generate',
                
                input: {
                    system: `Your Task is to generate gigya apis tests for the given request
                              - Use the test repo tool to find similar tests 
                              - Use the test repo tool to learn how to use gigya apis in the tests,
                              - Answer in c#
                              - write only the test it self no explanation 
                              - use existing infrastructures no need to rewrite it just use it in test
                              - use the publish test tool to post the tests `,
                    template:`generate tests for request: {{request}}`,
                    tools:{
                        testRepo: searchTestsTool,
                        publishTest: tool({
                            description: 'Generate a test',
                            parameters: z.object(({
                                name: z.string().describe('The test name'),
                                cs: z.string().describe('The c# code for the test'),
                                related: z.array(z.string()).describe('The related tests found in the test repo')
                            }))
                        })
                    }
                    
                },
               
            },
            on: {
                tool_call: {
                    actions: renderTo('test', ({event: {args: {cs, name}}}) => html`
                        <div class="flex items center space-x-2 rtl:space-x-reverse">
                            <span class="sm:text-sm md:text-lg lg:text-2xl font-semibold text-gray-900 dark:text-white">${name}</span>
                            <pre class="font-mono text-slate-900 inline text-wrap">${cs}</pre>

                        </div>

                    `)
                }
            }

        }
    }
}) 


    