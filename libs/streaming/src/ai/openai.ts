import {createOpenAI} from "@ai-sdk/openai"; 
import {embeddingsUrl, baseUrl, sapAIFetch, tokenService, createTokenService} from "sap-ai-token";
 import {EmbeddingModelV1, type LanguageModelV1} from "@ai-sdk/provider";
 
 export function openai(env: typeof process.env) {

     const openaiGP4o: () => LanguageModelV1 = () => createOpenAI({
         apiKey: ' value dummy: it will passed later with the `sapAIFetch`, but ai sdk will fail the call if no is provided',
         baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
         fetch: sapAIFetch

     }).chat('gpt-4o')

     const embedding: () => EmbeddingModelV1<string> = () => createOpenAI({
         apiKey: ' value dummy: it will passed later with the `sapAIFetch`, but ai sdk will fail the call if no is provided',
         baseURL: embeddingsUrl(env.SAP_AI_API_URL, env.SAP_AI_EMBEDDINGS_DEPLOYMENT_ID),
         fetch: sapAIFetch
     }).embedding(env.SAP_AI_EMBEDDINGS_MODEL_NAME || 'text-embed-v2')

     return {
         openaiGP4o,
         embedding
     }

 }



