import {EventMessage} from "fastify-sse-v2";
import {generateObject, jsonSchema, streamObject, streamText} from "ai";
import {openaiGP4o} from "../sap-ai/openai";
import {z} from "zod";
import {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
 
const routes: FastifyPluginAsyncZod = async function (fastify) { 
 

    fastify.route({
        url: '/thought/object',
        method: 'GET',
        schema: {
            operationId: 'thought.object',
            description: 'This route will generate a random thought using the GPT-4 model, and response in a structured json',
            summary: "JSON thought", 
            response: {
                200:  z.object({
                    category: z.string().describe('The category of the thought'),
                    time: z.string().describe('The time the thought refers to, for example, the 90s or the future'),
                    objects: z.array(z.string()).describe('The objects in the thought'),
                    references: z.array(z.string()).describe('The references in the thought'),
                    thought: z.string().describe('The thought itself')
                })
            }
        },
        async handler(request, reply) {
            const {object} = await generateObject({
                model: openaiGP4o(),
                prompt: 'Think about a random topic, and then share that thought',
                schema:  z.object({
                    category: z.string().describe('The category of the thought'),
                    time: z.string().describe('The time the thought refers to, for example, the 90s or the future'),
                    objects: z.array(z.string()).describe('The objects in the thought'),
                    references: z.array(z.string()).describe('The references in the thought'),
                    thought: z.string().describe('The thought itself')
                })   
            })   
            reply.type('application/json');
            return reply.send(object);
        }
    })


    fastify.route({
        url: '/thought/object/stream',
        method: 'GET', 
        schema: {
            operationId: 'thought.object.stream',
            summary: "JSON stream of thoughts",
            description: "This route will generate a random thought using the GPT-4 model, and stream the thought to the client as a JSON stream. It sets the Content-Type header to text/event-steam and writes each object as separate chunk.",
            produces: ['text/event-stream'], 
            response: {
                200: z.array(z.object({
                    category: z.string().describe('The category of the thought'),
                    time: z.string().describe('The time the thought refers to, for example, the 90s or the future'),
                    objects: z.array(z.string()).describe('The objects in the thought'),
                    references: z.array(z.string()).describe('The references in the thought'),
                    thought: z.string().describe('The thought itself')
                }))
            } 
        },
        async handler  (_, reply) {
            async function* streamObjectResponse() {
                const {elementStream} = await streamObject({
                    output: 'array',
                    model: openaiGP4o(),
                    prompt: 'Think about 5 random topics, and then share that thoughts',
                    schema:  z.object({
                        category: z.string().describe('The category of the thought'),
                        time: z.string().describe('The time the thought refers to, for example, the 90s or the future'),
                        objects: z.array(z.string()).describe('The objects in the thought'),
                        references: z.array(z.string()).describe('The references in the thought'),
                        thought: z.string().describe('The thought itself')
                    })
                });
                for await (const part of elementStream) {
                    yield {data: JSON.stringify(part)}
                } 
                yield {  event: 'done', data: 'done' }
            }
          
 
            return reply.sse(streamObjectResponse());
        }
    })


}




export default routes;
