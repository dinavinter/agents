import {useToken} from "./token";

export const sapAIFetch: typeof fetch = async (url, request) => {

    return await fetch(`${url}/?api-version=${process.env.OPENAI_API_VERSION}`,
        {
            ...request,
            body: request?.body,
            method: request?.method,
            headers: {
                ...(request?.headers ? Object.fromEntries(
                    Object.entries(request.headers)
                ) : {}),
                'ai-resource-group': 'default',
                Authorization: `Bearer ${await useToken()}`
            }
        }
    );
}


export const baseUrl = (sapAIUrl?:string, deployment?:string)=> `${sapAIUrl || process.env.SAP_AI_API_URL}/v2/inference/deployments/${deployment || process.env.SAP_AI_DEPLOYMENT_ID}`
export const embeddingsUrl = (sapAIUrl?:string, deployment?:string)=> `${sapAIUrl || process.env.SAP_AI_API_URL}/v2/inference/deployments/${deployment || process.env.SAP_AI_EMBEDDINGS_DEPLOYMENT_ID}`