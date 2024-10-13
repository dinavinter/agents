import {createOpenAI} from "@ai-sdk/openai";

import {embeddingsUrl, baseUrl, sapAIFetch, tokenService} from "sap-ai-token";
import {env} from "node:process";
import {AzureOpenAI} from "openai";

 export const openaiGP4o= ()=>createOpenAI({
    apiKey: ' value dummy: it will passed later with the `sapAIFetch`, but ai sdk will fail the call if no is provided',
    baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
    fetch: sapAIFetch
       
 }).chat('gpt-4o')


export const embedding = ()=> createOpenAI({
    apiKey: ' value dummy: it will passed later with the `sapAIFetch`, but ai sdk will fail the call if no is provided',
    baseURL:  embeddingsUrl(env.SAP_AI_API_URL, env.SAP_AI_EMBEDDINGS_DEPLOYMENT_ID),
    fetch: sapAIFetch
}).embedding(env.SAP_AI_EMBEDDINGS_MODEL_NAME || 'text-embed-v2')

export const azureOpenAI = () => {
    return new AzureOpenAI({
        // apiKey: ' value dummy: it will passed later with the `sapAIFetch`, but ai sdk will fail the call if no is provided',
        //
        apiVersion: "2024-05-01-preview",
        // baseURL: baseUrl(env.SAP_AI_API_URL, env.SAP_AI_DEPLOYMENT_ID),
        //  fetch: sapAIFetch,
    });
};