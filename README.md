  
# AI Agents 

This project showcases a series of AI agents built using the [xstate](https://github.com/statelyai/xstate) library, for easily managing state transitions and asynchronous tasks.

Each agent is a state machine that encapsulates the agent's behavior, actions, side effects, and ui rendering. 

The agents demonstrate integrations with external services like GitHub, Pinecone, and UI streaming, showcasing modern Web with AI capabilities.

## Table of Contents
- [Agents Overview](#agents-overview)
    - [Simple Agent](#simple-agent)
    - [Parallel Agent](#parallel-agent)
    - [Screen Set Builder](#screen-set-builder)
    - [Support Agent](#support-agent)
    - [Tic Tac Toe Agent](#tic-tac-toe-agent)
    - [Test Agent](#test-agent)
    - [GitHub Agent](#github-agent)
    - [Pinecone Agent](#pinecone-agent)
- [Running the Project](#running-the-project)
- [Implementation Details](#implementation-details)
    - [State Management](#state-management)
    - [UI Rendering](#ui-rendering)
    - [Streaming](#streaming)
        - [Streaming AI to UI](#streaming-ai-response-to-ui)
        - [Streaming Text Events](#streaming-text-events)
        - [Streaming Object Events](#streaming-object-events)
    - [Prompt: Context Variables](#construct-prompt-wt-context-variables)
    - [AI Tools](#ai-tools)
    - [API And SSE](#api)
- [SAP-AI-Integration](#sap-ai-integration)
- [Environment Variables](#environment-variables)
 
---
## Agents Overview

### [Simple Agent](./apps/agent/agents/simple.ts)
A straightforward agent that generates thoughts and corresponding doodles using OpenAI's openaiGP4o model. It serves as a basic example of using xstate for state transitions and rendering ui from the server.

### [Parallel Agent](./apps/agent/agents/parallel.ts)
The Parallel Agent is designed to handle multiple asynchronous tasks concurrently. It uses OpenAI's openaiGP4o model to generate thoughts and doodles, demonstrating how to manage parallel streams and events effectively using xstate.

### [Screen Set Builder](./apps/agent/agents/screen.ts)
This agent assists developers in creating a wizard of forms for applications. It interprets user requests using OpenAI's model and generates corresponding screen drafts, including fields and CSS styling. The agent showcases the integration of AI with UI components and state management.

### [Support Agent](./apps/agent/agents/screen.ts)
The Support Agent acts as a customer support representative, capable of classifying customer issues and routing them to the appropriate department. It uses [@statelyai/agent](https://stately.ai/agent) for decision-making logic and integrates with OpenAI to generate concise responses.

### [Tic Tac Toe Agent](./apps/agent/agents/tictac.ts)
A simple Tic Tac Toe game agent that uses AI to play against itself, demonstrating the use of OpenAI's model to decide moves. It highlights game state management and AI decision-making.


### [Test Agent](./apps/agent/agents/test.ts)
Designed to generate API tests based on user input, this agent integrates with Azure's OpenAI service. It demonstrates how to manage the process of creating, sending, and streaming messages using xstate and highlights integration with [Azure AI's assistant API](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/assistant).

---
> Note: The following agents are not yet supported in UI.

### [GitHub Agent](./apps/agent/agents/git.ts)
The GitHub Agent loads and analyzes tests from a GitHub repository, creating a JSON file with test details. It demonstrates the integration with GitHub's API and the use of file system persistence for state management.

### [Pinecone Agent](./apps/agent/agents/pincone.ts)
This agent integrates with [Pinecone](https://www.pinecone.io) to perform semantic searches for peviosly embedded tests and API usage. It uses AI embeddings and Pinecone's vector database, showcasing advanced search capabilities and AI integration.

---

## Running the Project

Configure the environment variables in a `.env` file in the root directory of the project.  (see [Environment Variables](#environment-variables) for details)

If `pnpm` is not installed, install it using the following command:
```bash
npm install -g pnpm 
```

Then, continue with the following commands:

```bash
pnpm install
pnpm dev
```

This command will start the project on port 5002. You can access the agents by navigating to the following URLs:

- [Simple Agent](http://localhost:5002/simple)
- [Parallel Agent](http://localhost:5002/parallel)
- [Screen Set Builder](http://localhost:5002/screen)
- [Support Agent](http://localhost:5002/support)
- [Tic Tac Toe Agent](http://localhost:5002/tictac)
- [Test Agent](http://localhost:5002/test)
- [GitHub Agent](http://localhost:5002/git)
- [Pinecone Agent](http://localhost:5002/pinecone)

---
## Implementation Details

### State Management
Each agent is built using the xstate library, which provides a powerful and flexible framework for managing state transitions, side effects, and asynchronous tasks. The agents are defined as state machines, with states and transitions that encapsulate the agent's behavior and logic. 

For example, the Simple Agent's state machine is defined as follows:

```js
const machine = Machine({
    id: 'simpleAgent',
    initial: 'loading',
    context: {
        thought: '',
    },
    states: { 
        loading: {
            invoke: {
                src:  fromPromise(async () => {
                  const {text} = await streamText({
                        model: openaiGP4o(),
                        prompt: 'Think about a random topic, and then share that thought.', 
                    })
                  return  await text()
                }), 
                onDone: {
                    target: 'idle',
                    actions: assign({
                        thought: ({event:{output}}) => output,
                    })
                }
            }
        },
    },
});

```

The state machine defines the agent's states and transitions, including the initial state, context, and actions to perform when transitioning between states. The agent's behavior is encapsulated within the state machine, providing a clear and structured way to define and manage the agent's logic.


### UI Rendering
T
To facilitate server-side UI rendering with Server-Sent Events (SSE) and create cohesive agent components in a single file, we use [htmx](https://htmx.org/). This approach allows each agent to render directly to the root element using the render function. For instance:

```js
const machine = Machine({
  id: 'simpleAgent',
  initial: 'idle',
  entry: render(({ html }) => html`<div ....>...</div>`),
})
```

For nested rendering, you can define a container by specifying hx-ext="sse" and sse-swap="<your-nested-name>" in the HTML element. To render content into this nested container, use the renderTo(<your-nested-name>, ...) function. This setup enables dynamic and modular UI updates, leveraging server-side logic for rendering decisions. For instance:

```js
const machine = Machine({
   id: 'smartToDo',
   initial: 'generate',
   entry: render(({html}) => html`
        <main class="mx-auto bg-slate-50 h-full">
             <div hx-ext="sse" sse-swap="to-do-items">
        </main>`), 
  states: {
    generate: {
      invoke: {
        src: 'generate',
        onDone: {
          actions: renderTo('to-do-items',  ({event: {name, desc, date}}) =>   html` <div class="flex flex-col gap-4">
                            <h1>${name}</h1>
                            <p>${desc}</p>
                            <p>${date}</p>
                           </div>`)
        }
      }
    }
  }
})

```

### Streaming

To stream AI responses into the state machine's events, we use an [observable actor](https://stately.ai/docs/observable-actors)  to stream the AI response into the state machine's events, triggering state transitions and actions based on the response.

#### Streaming AI response to UI

To stream AI responses directly into the UI, we can use swap attributes with the @{actor}.{event} syntax. This approach allows us to render the AI response directly into the UI without additional state transitions or actions. For instance:

```js
const machine = Machine({
    id: 'simpleAgent',
    initial: 'loading',
    context: {
        thought: '',
    },
    entry: renderTo('content', ({html}) => html`
                <${ChatBubble} name="Thinker" 
                               img="https://flowbite.com/docs/images/people/profile-picture-5.jpg" 
                               swap="@thinker.text-delta" />
 
                 `
    ),
    states: {
        states: {
            thinking: {
                invoke: {
                    src: 'aiStream',
                    id: 'thinker',
                    systemId: 'thinker',
                    input: 'Think about a random topic, and then share that thought.'
                }
            }
        }
    }
});

```

#### Streaming Text Events

`fromAIEventStream` is a utility function that creates an observable actor from an AI model and a prompt. The function takes an object with the model and prompt properties and returns an observable actor that streams the AI response into the state machine's events. For instance:
    
 ```js
    const machine = Machine({
    id: 'simpleAgent',
    initial: 'loading',
    context: {
        thought: '',
    },
    states: {
        loading: {
            invoke: {
                src: fromAIEventStream({
                    model: openaiGP4o(),
                    prompt: 'Think about a random topic, and then share that thought.',
                }),

            },
            on: {
                'text-delta': {
                    actions: emit(({event: {textDelta}}) => ({
                        type: 'thought',
                        data: textDelta
                    }))
                }
            }
        }
    }
});
```

#### Streaming Object Events

`fromAIElementStream` is a utility function that creates an observable actor from an AI model and a template. The function takes an object with the model and template properties and returns an observable actor that streams the AI response into the state machine's events. For instance:

> see usage in [screen](./apps/agent/agents/screen.ts) agent
    
```js
const machine = Machine({
    id: 'simpleAgent',
    initial: 'loading',
    context: {
        form: '',
        fields: [],
    },
    states: {
        loading: {
            invoke: {
                src: 'aiElementStream',
                id: 'draft',
                input: {
                    template: `You are an helpfully assistant that helps developers to generate fields for a form about {{form}}`,
                    schema: z.object({
                        type: z.string().describe('the field type, for example: text, email, password, submit, etc.'),
                        name: z.string().describe('the field name, for example: email, password, address, phone, etc.'),
                        label: z.string().describe('the field label, for example: Email, Password, Address, Phone, etc.'),
                    })
                },
                on: {
                    '*': {
                        actions: assign({
                            fields: ({context: {fields}, event: {name, type, description}}) => [...fields, {
                                name,
                                type,
                                description
                            }]
                        })
                    }
                }
            }
        }
    }
}).provide({
    actors:{
        aiElementStream: fromAIElementStream({
            model: openaiGP4o(),
        })
    }
})
```


#### Construct Prompt w/t Context Variables

To construct prompts with context variables, we use the `template` param in the input object. The template string can include placeholders for context variables, which are replaced with the actual values when the AI model is called. For instance:

```js
const machine = Machine({
    id: 'simpleAgent',
    initial: 'loading',
    context: {
        category: 'nature',
    },
    states: {
        loading: {
            invoke: {
                src: fromAIEventStream({
                    model: openaiGP4o(),
                    prompt: 'Think about a random topic in {{category}} category, and then share that thought.',
                }),

            }
        }
    }
           
    
})
```

### AI Tools

AI tools are incorporated using actions and invoked services. For instance, tools like findDoodleTool or searchTestsTool are used to perform specific AI-driven tasks, such as finding a doodle or searching for tests. These tools can be called within the state machine's states using invoke or on event handlers.

Example AI Tool Invocation: in the Simple Agent's state machine, the generate state invokes the generate service with tools param to find doodles in an embedding source

> see usage in [simple](./apps/agent/agents/simple.ts) agent

```js
{
    const machine = createMachine({
        id: 'simpleAgent',
        initial: 'generate',
        states: {
            generate: {
                invoke: {
                    src: fromAIEventStream({
                        model: openaiGP4o(),
                        prompt: 'find a doodle that describes the thought {{thought}}',
                        tools: {
                            findDoodleTool
                        }
                    }),
                },
                on: {
                    'tool-result': {
                        actions: render(({event: {result: {src, alt}}, html}) => html`
                              <${SVG} src="${src}" alt="${alt}" /
                      `)
                    }
                }
            }
        }
    });

}

```        
 
  
### API
The agents are served using [fastify](https://fastify.dev/), a fast and low overhead web framework for Node.js. The API routes are defined in the [`api.ts`](./apps/agent/api.ts) file, which handles requests and responses for the agents.
 
The API routes are defined as follows:
  - `GET /agents` - Returns a catalog of available agents.
  - `GET /agents/:agent` - Generates a workflow id and redirects to the workflow route.
  - `GET /agents/:agent/:workflow` 
    - `accept: text/event-stream`: Returns the workflow's events as Server-Sent Events (SSE).
    - `accept: text/html`: Renders the workflow's UI container using that subscribes to the agent's events using htmx.
  -  `GET /agents/:agent/:workflow/events/:event` -  Returns the workflow's events as Server-Sent Events (SSE) filtered by event name.
  -  `POST /agents/:agent/:workflow/events/:event` - Sends an event to the agent's state machine based on the workflow id and event name.

---

### SAP-AI-Integration
SAP AI Api is almost the same as openai or azure apis but with small changes that requires some tweaks in the code to make it work.
For using ai-sdk with SAP AI, you need to set the baseUrl with the v2/inference/deployments/{deploymentId} path, and add custom fetch to set the ai-resource-group header and api-version.

```js
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
For this project, we have a library called `sap-ai-token` that provides a token service and the custom fetch function required to integrate with the SAP AI API. The library also includes utility functions for constructing the base URL and base URL with the embedding path.

####  libs/sap-ai-token
In this library, we have a token service that fetches a token from the SAP AI API and injects it into the fetch request to the SAP AI API. The token service uses the SAP credentials provided in the environment variables. 
The environment variables required are:
- SAP_TOKEN_URL
- SAP_AI_CLIENT_ID
- SAP_AI_CLIENT_SECRET
- SAP_AI_API_URL
- SAP_AI_DEPLOYMENT_ID

You can also find baseUrl, and baseUrlEmbedding functions that return the base URL for the SAP AI API and the base URL for the SAP AI API with the embedding path, respectively.
The environment variables required are:
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
 
### Environment Variables

To run the project, you need to set up the following environment variables:

```bash
SAP_TOKEN_URL=<token_url>
SAP_AI_CLIENT_ID=<client_id>
SAP_AI_CLIENT_SECRET=<client_secret>
SAP_AI_API_URL=<api_url>
SAP_AI_DEPLOYMENT_ID=<deployment_id>
```
#### Optional (depends on agent usage)

```bash
SAP_AI_EMBEDDINGS_DEPLOYMENT_ID=<embeddings_deployment_id>
GITHUB_TOKEN=your-github-api-token
PINECONE_API_KEY=your-pinecone-api-key
```

You can set these variables in a `.env` file in the root directory of the project. 

