import {z} from "zod";
import {streamObject, streamText} from "ai";
import {openaiGP4o} from "../sap-ai/openai";
import {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {EventMessage} from "fastify-sse-v2";
import "@fastify/swagger";
import {FastifyInstance} from "fastify";

function trimCode(this: any, key: string, value: any): any {
    //replace all between <code> and </code> with ... or <pre>...</pre>

}

type SwaggerApi = Exclude<ReturnType<FastifyInstance["swagger"]>, string>

function apiText(swagger: SwaggerApi): string {
    const {['/dynamic-docs']: dom, ['/']: root, ...api} = swagger.paths!

    const apis = Object.entries(api).map(([path, pathItem]) =>
        Object.entries(pathItem).flatMap(([method, operation]) => {
            if (operation && typeof operation === "object" && "x-source" in operation && typeof operation["x-source"] === "string" && "description" in operation && typeof operation["description"] === "string") {
                const {['x-source']: source, description, ...rest} = operation;
                return {
                    method,
                    path,
                    description: description?.replace(source, ''),
                    ...rest
                }
            }
            return operation
        })).flat()

    return JSON.stringify(apis);

}

const routes: FastifyPluginAsyncZod = async function (fastify) {

    fastify.route({
            url: '/dynamic-docs',
            method: 'GET',
            schema: {
                summary: "HTML stream of thoughts",
                description: "This route will generate a dynamic HTML page interacts with the AI model. The page will be streamed to the client as Server-Sent Events (SSE) messages. It sets the Content-Type header to text/event-stream and writes each HTML element as a separate chunk.",
                response: {
                    200: z.string().describe('Html elements created by the AI model')
                },
                produces: ['text/event-stream']
            },
            async handler(request, reply) {
                fastify.log.debug(apiText(fastify.swagger()))

                async function* streamElements(): AsyncIterable<EventMessage> {
                    
                    const {elementStream} = await streamObject({
                        output: 'array',
                        model: openaiGP4o(),
                        temperature: 0.7,
                        topP: 1,
                        maxTokens: 4096,
                        schema: z.object({
                            outerHTML: z.string().describe('The outer html of the element'),
                            api: z.string().describe('The api you are simulating or interacting with in the element, for example /thought/text')
                        }),
                        prompt: `Generate HTML code that interacts with the following API: """${apiText(fastify.swagger())}""".  The elements you return will be added to the main div in an HTML page.
    Use HTMX for interactivity and stream response, use the SSE extension for streaming SSE responses, and other hx attributes for non-SSE responses. (hx-ext ="sse", sse-connect , sse-swap, hx-swap) vs (hx-trigger, hx-get, hx-swap, etc.)
    Output only valid HTML elements. Use Tailwind CSS for styling and animation.
    Make the elements understandable, fun, interactive, and colorful..`  .replace(/"/g, '\\"').replace(/\n/g, '\\n')
                    });
                    
                    for await (const {outerHTML} of elementStream) {
                        if (request.socket.destroyed) return "done";

                        yield {data: outerHTML}
                    }
                    yield {event: 'done', data: 'done'}
                }


                return reply.sse(streamElements());
            }
        }
    )
}
export default routes;


const example = `
data: <div class='text-xl p-4 m-4 bg-blue-100 rounded-lg shadow-lg' hx-get='/thought/text' hx-trigger='load' hx-swap='outerHTML'>Loading thought...</div>

data: <div class='text-xl p-4 m-4 bg-green-100 rounded-lg shadow-lg' hx-ext='sse' sse-connect='/thought/text/stream' sse-swap='message' hx-swap='textContent transition:true swap:1s settle:1s' sse-close='done'>Waiting for thought stream...</div>

data: <div class='text-xl p-4 m-4 bg-yellow-100 rounded-lg shadow-lg' hx-get='/thought/object' hx-trigger='load' hx-swap='outerHTML'>Loading structured thought...</div>

data: <div class='text-xl p-4 m-4 bg-red-100 rounded-lg shadow-lg' hx-ext='sse' sse-connect='/thought/object/stream' sse-swap='message' hx-swap='textContent transition:true swap:1s settle:1s' sse-close='done'>Waiting for structured thought stream...</div>

data: <div class='p-4 bg-purple-400 rounded-lg shadow-lg text-white max-w-md m-auto mt-4'><h2 class='text-lg font-bold'>Random Thought Stream</h2><p>Receive a continuous stream of random thoughts in plain text.</p><button class='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-2' hx-ext='sse' sse-connect='/thought/text/stream' sse-swap='message' hx-swap='beforeend' sse-close='done'>Start Streaming</button></div>

data: <div class='p-4 bg-green-300 rounded-lg shadow-lg text-gray-800 max-w-md m-auto mt-4'><h2 class='text-lg font-bold'>Random Thought JSON Stream</h2><p>Stream structured JSON thoughts with detailed properties.</p><button class='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-2' hx-ext='sse' sse-connect='/thought/object/stream' sse-swap='message' hx-swap='beforeend' sse-close='done'>Start JSON Stream</button></div>

data: <div class='p-4 m-4 bg-blue-200 rounded-lg shadow-md'><h2 class='text-lg font-bold'>Proxy Server Sent Events</h2><input type='text' class='mt-2 p-2 border rounded w-full' placeholder='Enter URL to proxy' name="url" value="/thought/text/stream"><button class='mt-2 p-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded' hx-get='/sse-proxy'  hx-include="[name='url']" hx-trigger='click' hx-target='#sse-proxy' >Start Proxy</button> <div id="sse-proxy" /> </div>
`