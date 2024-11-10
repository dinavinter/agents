# fastify-ai-starter

```shell
pnpm i 

pnpm dev
```


## Routes 

### Generate Text

```http  
 GET /thought/text
```

This route will generate a random thought using the GPT-4 model, and stream the thought to the client as a plain text stream. Writes. It sets the Content-Type header to text/plain and writes each text delta as a separate chunk.

```js
async function (_, reply) {
  const result = await streamText({
    model: openaiGP4o(),
    prompt: "Think about a random topic, and then share that thought"
  });
  result.pipeTextStreamToResponse(reply.raw);
  return reply
}

```

### TEXT Stream
```http
GET /thought/text/stream
```

This route will generate a random thought using the GPT-4 model, and stream the thought to the client as Server-Sent Events (SSE) messages.It sets the Content-Type header to text/event-stream and writes each text delta as a separate chunk.


```js
async handler (_, reply) {
  async function* streamTextResponse () {
   
   const { textStream } = await streamText({
      model: openaiGP4o(),
      prompt: "Think about a random topic, and then share that thought"
    });


    for await (const part of textStream) {
      yield {  data: part  }
    }

    yield { event: "done",  data: "done" }
  }
  __name(streamTextResponse, "streamTextResponse");
  return reply.sse(streamTextResponse())
}
```

### Generate JSON 

```http
GET /thought/object
```

This route will generate a random thought using the GPT-4 model, and response in a structured json

```js
async handler (request, reply) {
  const { object} = await generateObject({
    model: openaiGP4o(),
    prompt: "Think about a random topic, and then share that thought",
    schema: z.object({
      category: z.string().describe("The category of the thought"),
      time: z.string().describe("The time the thought refers to, for example, the 90s or the future"),
      objects: z.array(z.string()).describe("The objects in the thought"),
      references: z.array(z.string()).describe("The references in the thought"),
      thought: z.string().describe("The thought itself")
    })
  });

  reply.type("application/json");
  return reply.send(object)
}
```

### JSON stream

```http
GET /thought/object/stream
```

This route will generate a random thought using the GPT-4 model, and stream the thought to the client as a JSON stream. 
It sets the Content-Type header to text/event-steam and writes each object as separate chunk.

```js
async handler (_, reply) {

  async function* streamObjectResponse () {
    const { elementStream} = await streamObject({
      output: "array",
      model: openaiGP4o(),
      prompt: "Think about 5 random topics, and then share that thoughts",
      schema: z.object({
        category: z.string().describe("The category of the thought"),
        time: z.string().describe("The time the thought refers to, for example, the 90s or the future"),
        objects: z.array(z.string()).describe("The objects in the thought"),
        references: z.array(z.string()).describe("The references in the thought"),
        thought: z.string().describe("The thought itself")
      })
    });

    for await (const part of elementStream) {
      yield { data: JSON.stringify(part)  }
    }

    yield { event: "done", data: "done" }

  }
  return reply.sse(streamObjectResponse())
}
```



### HTML Stream

```http
GET /dynamic-docs
```

This route will generate a dynamic HTML page interacts with the AI model. The page will be streamed to the client as Server-Sent Events (SSE) messages. It sets the Content-Type header to text/event-stream and writes each HTML element as a separate chunk.

```js
async handler (request, reply) {
  const api = fastify.swagger();
  console.log(apiText(api));
  async function* streamElements () {
    const controller = new AbortController;
    
    reply.raw.on("close", () => {
      controller.abort()
    });

    const { elementStream } = await streamObject({
      output: "array",
      model: openaiGP4o(),
      temperature: .7,
      topP: 1,
      maxTokens: 4096,
      abortSignal: controller.signal,
      schema: z.object({
        outerHTML: z.string().describe("The outer html of the element"),
        api: z.string().describe("The api you are simulating or interacting with in the element, for example /thought/text")
      }),
      prompt: `Generate HTML code that interacts with the following API: """${apiText(api)}""".  The elements you return will be added to the main div in an HTML page.
    Use HTMX for interactivity and stream response, use the SSE extension for streaming SSE responses, and other hx attributes for non-SSE responses. (hx-ext ="sse", sse-connect , sse-swap, hx-swap) vs (hx-trigger, hx-get, hx-swap, etc.)
    Output only valid HTML elements.
    Use Tailwind CSS for styling and animation.
    Make the elements understandable, fun, interactive, and colorful..`
    });

    for await (const { outerHTML} of elementStream) {
        yield { data: outerHTML }
    }

    yield {  event: "done",  data: "done" }

  }

  return reply.sse(streamElements())
}
```