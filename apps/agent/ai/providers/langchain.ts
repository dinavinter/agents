import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { baseUrl, tokenService} from "sap-ai-token";
import {env} from "node:process";
 
export const langchain =async (options?: ConstructorParameters<typeof ChatOpenAI>[0] , env =process.env) => {
    return new ChatOpenAI({
        temperature: 0,
        modelName: env.SAP_AI_MODEL_NAME,
        openAIApiKey: await tokenService.accessToken(),
        configuration: {
            baseURL: baseUrl(process.env.SAP_AI_API_URL, process.env.SAP_AI_DEPLOYMENT_ID),
            defaultQuery: {
                'api-version': env.OPENAI_API_VERSION,
            },
            dangerouslyAllowBrowser: true,
            maxRetries: 1,
            timeout: 5000,
            defaultHeaders: {
                'ai-resource-group': 'default',
            },
            ...(options?.configuration || {})
        },
        ...(options || {})
    })
}


export const langchainEmbedding = async (options?: ConstructorParameters<typeof OpenAIEmbeddings>[0] , env =process.env) => {
   return  new OpenAIEmbeddings({
       modelName: env.SAP_AI_EMBEDDINGS_MODEL_NAME,
       openAIApiKey: await tokenService.accessToken(),
       configuration: {
           baseURL: `${env.SAP_AI_API_URL}/v2/inference/deployments/${env.SAP_AI_EMBEDDINGS_DEPLOYMENT_ID}`,
           defaultQuery: {
            'api-version': env.OPENAI_API_VERSION,
        },
        dangerouslyAllowBrowser: true,
        maxRetries: 1  ,
        timeout: 1000,
        defaultHeaders: {
            'ai-resource-group': 'default',
        },
        ...(options?.configuration || {})
    },
    ...(options || {})
})
}