import {createOpenAI} from "@ai-sdk/openai";

import { baseUrl,sapAIFetch} from "sap-ai-token";

 export const openaiGP4o= ()=>createOpenAI({
    apiKey: ' value dummy: it will passed later with the `sapAIFetch`, but ai sdk will fail the call if no is provided',
    baseURL: baseUrl(process.env.SAP_AI_API_URL, process.env.SAP_AI_DEPLOYMENT_ID),
    fetch: sapAIFetch
       
 }).chat('gpt-4o')