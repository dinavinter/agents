  
# SAP AI Usage Examples

This repository contains multiple applications and libraries that utilize SAP AI and various SDKs for AI functionalities. The primary languages used are TypeScript and JavaScript 

SAP AI Api is almost the same as openai or azure apis but with small changes that requires some tweaks in the code to make it work.


## Table of Contents
- [Langchain](#langchain)
- [AI-SDK](#ai-sdk)
- [Project Structure](#project-structure)
  - [Libs](#libs)
    - [libs/sap-ai-token](#libs/sap-ai-token)
  - [Applications](#applications)
    - [apps/ai-sdk](#apps/ai-sdk)
    - [apps/agent](#apps/agent)
    - [apps/langchain](#apps/langchain)
- [Setup](#setup)

## Langchain
For example, for using `langchain` sdk with SAP AI, You need to 
1. get access token for the apikey
2. set the `baseUrl` with the `v2/inference/deployments/{deploymentId}` path,
3. add  `ai-resource-group` default headers,
4. add `api-version` to the default query.


```typescript

const llm = new ChatOpenAI({
    temperature: 0,
    openAIApiKey: await accessToken(),
    configuration: {
        baseURL: `${env.SAP_AI_API_URL}/v2/inference/deployments/${env.SAP_AI_DEPLOYMENT_ID}`,
        defaultQuery: {
            'api-version': env.OPENAI_API_VERSION,
        },
        dangerouslyAllowBrowser: true,
        maxRetries: 1,
        timeout: 5000,
        defaultHeaders: {
            'ai-resource-group': 'default',
        }
    }
})

```

## AI-SDK
For using `ai-sdk` with SAP AI, you need to set the `baseUrl` with the `v2/inference/deployments/{deploymentId}` path, and add custom fetch to set the `ai-resource-group` header and api-version.

```typescript 
    import {createOpenAI} from "@ai-sdk/openai";

    const openaiGP4o = createOpenAI({
        apiKey: await accessToken(),
        baseURL: `${env.SAP_AI_API_URL}/v2/inference/deployments/${env.SAP_AI_DEPLOYMENT_ID}`,
        fetch: (url, request) => fetch(`${url}/?api-version=${process.env.OPENAI_API_VERSION}`,
            {
                ...request,
                body: request?.body,
                method: request?.method,
                headers: {
                    ...(request?.headers ? Object.fromEntries(
                        Object.entries(request.headers)
                    ) : {}),
                    'ai-resource-group': 'default'
                }
            }
        )
    }).chat('gpt-4o') 
    
     
```
## Project Structure
### Libs
####  libs/sap-ai-token
In this library, we have a token service that fetches a token from the SAP AI API and injects it into the fetch request to the SAP AI API. The token service uses the SAP credentials provided in the environment variables. 
The environment variables required are:
- SAP_TOKEN_URL
- SAP_AI_CLIENT_ID
- SAP_AI_CLIENT_SECRET


You can also find baseUrl, and baseUrlEmbedding functions that return the base URL for the SAP AI API and the base URL for the SAP AI API with the embedding path, respectively.
The environment variables required are:
- SAP_AI_API_URL
- SAP_AI_DEPLOYMENT_ID
- SAP_AI_EMBEDDINGS_DEPLOYMENT_ID

##### Usage example 

#### ai-sdk
```typescript
import {sapAIFetch, baseUrl, tokenService} from "sap-ai-token";
import {createOpenAI} from "@ai-sdk/openai";

//or, without env, tokenService.credentials({client_d: 'value', client_ecret: 'value...'})
tokenService.credentialsFromEnv();

//or, without env, baseUrl('https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com' , deploymentId),
const openaiGP4o = createOpenAI({
        apiKey: ' value dummy: ai sdk will faill the call if no is provided',
        baseURL: baseUrl(),
        fetch: sapAIFetch
    }).chat('gpt-4o')
    
    
```

#### langchain
```typescript
import {sapAIFetch, baseUrl, tokenService} from "sap-ai-token"
import {ChatOpenAI} from "@langchain/openai";

//or, without env, tokenService.credentials({client_d: 'value', client_ecret: 'value...'})
tokenService.credentialsFromEnv();

const llm = new ChatOpenAI({
  temperature: 0,
  openAIApiKey: await tokenService.accessToken(),
  configuration: {
    baseURL: baseUrl(),
    defaultQuery: {
      'api-version': env.OPENAI_API_VERSION,
    },
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 5000,
    defaultHeaders: {
      'ai-resource-group': 'default',
    }
  }
})
```



### Applications

#### [apps/ai-sdk](apps/ai-sdk)
A simple usage example of SAP AI with Vercel AI SDK and CLI chat.
```bash
pnpx nx start ai-sdk
```

#### [apps/agent](apps/agent)
Example usage example of SAP AI with `statelyai/agent`  https://stately.ai/docs/agents
```bash
pnpx nx start agent
```

#### [apps/langchain](apps/langchain)
Example usage of SAP AI with `langchain` https://langchain.com/docs
```bash
pnpx nx start langchain
```

## Setup

```bash
git clone git@github.com:dinavinter/sap-ai.git
npm install -g pnpm
pnpm install
```
