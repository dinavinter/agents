import {tokenService} from "./index";
 

export const fetchWithLog :typeof fetch = async (url, request) => {
    console.debug('ai-request',url, {
        method: request?.method,
        headers: request?.headers && Object.fromEntries(Object.entries(request.headers)) ,
        body: request?.body
    }) 
    
    const response = await fetch(url, request)
    
    console.debug('ai-response', response.statusText, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text()
    } )
    return response;
}

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
                Authorization: `Bearer ${await tokenService.accessToken()}`
            }
        }
    ); 
}


export const baseUrl = (sapAIUrl?:string, deployment?:string)=> `${sapAIUrl || process.env.SAP_AI_API_URL}/v2/inference/deployments/${deployment || process.env.SAP_AI_DEPLOYMENT_ID}`
export const embeddingsUrl = (sapAIUrl?:string, deployment?:string)=> `${sapAIUrl || process.env.SAP_AI_API_URL}/v2/inference/deployments/${deployment || process.env.SAP_AI_EMBEDDINGS_DEPLOYMENT_ID}`