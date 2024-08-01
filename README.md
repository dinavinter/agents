 
## apps/simple-chat
simple usage of sap-ai with vercel ai sdk and cli chat
### Run simple-chat
```bash
pnpx nx start simple-chat


##  libs/sap-ai-token
fetch sap token to inject in fetch request to sap ai api

### Usage example

```typescript
import {sapAIFetch, baseUrl, tokenService} from "sap-ai-token";

    tokenService.credentialsFromEnv();
    
    const openaiGP4o = createOpenAI({
        apiKey: ' value dummy: ai sdk will faill the call if no is provided',
        baseURL: baseUrl(process.env.SAP_AI_API_URL, process.env.SAP_AI_DEPLOYMENT_ID),
        fetch: sapAIFetch
    }).chat('gpt-4o')
   
    const result = await streamText({
        model: openaiGP4o,
        system: `You are a helpful, respectful and honest assistant.`,
        messages,
    });
    
```
    


```

