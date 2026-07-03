/**
 * A2A Client - sends tasks to the deployed A2A agent and streams back SSE responses.
 *
 * The A2A protocol uses JSON-RPC over HTTP with SSE for streaming.
 * - POST /message:send   -> synchronous task response
 * - POST /message:stream -> SSE stream of task updates + artifacts
 */

const A2A_AGENT_URL = process.env.A2A_AGENT_URL || "http://localhost:9000";
const USE_OPENAI_COMPAT = process.env.A2A_USE_OPENAI === "true" || A2A_AGENT_URL.includes("/v1/");

export interface A2ATaskParams {
  /** The resolved prompt text */
  prompt: string;
  /** 'text' for streamText, 'array' for streamObject */
  mode: "text" | "array";
  /** Zod schema JSON for structured output (element stream) */
  schema?: any;
  /** System prompt */
  system?: string;
  /** Tool definitions (serialized) */
  tools?: Record<string, { description: string; parameters: any }>;
  /** Model temperature */
  temperature?: number;
}

export interface A2AStreamEvent {
  type: string;
  [key: string]: any;
}

/**
 * Send a task to the A2A agent and stream back events via SSE.
 *
 * The A2A agent receives the AI options as structured task message parts,
 * processes them through SAP AI Core, and streams back:
 * - For text mode: text-delta events + final output
 * - For array mode: element objects + final output array
 */
export async function* streamA2ATask(
  params: A2ATaskParams
): AsyncGenerator<A2AStreamEvent> {
  console.log(`[a2a] streamA2ATask called, USE_OPENAI_COMPAT=${USE_OPENAI_COMPAT}, mode=${params.mode}`);
  if (USE_OPENAI_COMPAT) {
    yield* streamOpenAICompat(params);
    return;
  }
  
  const messageId = crypto.randomUUID();
  const body = {
    jsonrpc: "2.0",
    id: messageId,
    method: "message/stream",
    params: {
      message: {
        role: "user",
        parts: [
          {
            type: "text",
            text: JSON.stringify(params),
          },
        ],
        messageId,
        metadata: {
          mode: params.mode,
          ...(params.schema && { schema: params.schema }),
          ...(params.system && { system: params.system }),
          ...(params.temperature !== undefined && {
            temperature: params.temperature,
          }),
          ...(params.tools && { tools: params.tools }),
        },
      },
    },
  };

  const response = await fetch(`${A2A_AGENT_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `A2A agent returned ${response.status}: ${await response.text()}`
    );
  }

  if (!response.body) {
    throw new Error("A2A agent returned no body");
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6);
      } else if (line === "" && currentData) {
        // End of SSE event
        try {
          const parsed = JSON.parse(currentData);
          yield parseA2AEvent(parsed, currentEvent);
        } catch {
          // Non-JSON data, yield as text-delta
          if (currentData.trim()) {
            yield { type: "text-delta", textDelta: currentData };
          }
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }
}

/**
 * Parse an A2A SSE event into the format expected by xstate actors.
 *
 * A2A events follow this pattern:
 * - TaskStatusUpdateEvent: { type: "status", task: { status: { state, message } } }
 * - TaskArtifactUpdateEvent: { type: "artifact", task: { artifacts: [...] } }
 */
function parseA2AEvent(data: any, eventType: string): A2AStreamEvent {
  // Handle JSON-RPC result wrapper
  const result = data.result || data;

  // Task status update with working state = streaming text delta
  if (result.status?.state === "working" && result.status?.message?.parts) {
    const text = result.status.message.parts
      .filter((p: any) => p.type === "text" || p.text)
      .map((p: any) => p.text)
      .join("");

    if (text) {
      try {
        // Try parsing as structured event from the agent
        const parsed = JSON.parse(text);
        return parsed;
      } catch {
        return { type: "text-delta", textDelta: text };
      }
    }
  }

  // Task artifact = final result
  if (result.artifact || result.artifacts) {
    const artifacts = result.artifacts || [result.artifact];
    for (const artifact of artifacts) {
      if (artifact?.parts) {
        const text = artifact.parts
          .filter((p: any) => p.type === "text" || p.text)
          .map((p: any) => p.text)
          .join("");
        if (text) {
          try {
            return JSON.parse(text);
          } catch {
            return { type: "output", output: text };
          }
        }
      }
    }
  }

  // Completed task
  if (result.status?.state === "completed") {
    if (result.artifacts?.length) {
      const text = result.artifacts[0].parts
        ?.filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join("");
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return { type: "output", output: text };
        }
      }
    }
    return { type: "output", output: "" };
  }

  // Fallback
  return { type: eventType || "unknown", data: result };
}

/**
 * OpenAI-compatible streaming fallback.
 * Sends chat completions request to an OpenAI-compatible proxy (e.g. ai-core-proxy)
 * and converts the SSE stream into A2A-style events.
 */
async function* streamOpenAICompat(
  params: A2ATaskParams
): AsyncGenerator<A2AStreamEvent> {
  const messages: any[] = [];
  
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  
  messages.push({ role: "user", content: params.prompt });

  const body: any = {
    model: process.env.A2A_MODEL || "gpt-4o",
    messages,
    stream: true,
    temperature: params.temperature ?? 0.9,
  };

  // For structured output (array mode), use response_format
  if (params.mode === "array" && params.schema) {
    messages[messages.length - 1].content += 
      `\n\nRespond with a JSON array where each element matches this schema: ${JSON.stringify(params.schema)}. Output ONLY valid JSON.`;
  }

  const url = A2A_AGENT_URL.endsWith("/chat/completions") 
    ? A2A_AGENT_URL 
    : `${A2A_AGENT_URL}/v1/chat/completions`;

  // Use http module for reliable streaming (avoids undici/HTTP2 buffering issues)
  const { default: http } = await import("http");
  const parsedUrl = new URL(url);
  
  const bodyStr = JSON.stringify(body);
  let fullText = "";
  
  const events: A2AStreamEvent[] = await new Promise((resolve, reject) => {
    const results: A2AStreamEvent[] = [];
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (chunk: Buffer) => { errBody += chunk.toString(); });
        res.on("end", () => reject(new Error(`OpenAI proxy returned ${res.statusCode}: ${errBody}`)));
        return;
      }
      
      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              fullText += delta.content;
              results.push({ type: "text-delta", textDelta: delta.content });
            }
          } catch {
            // skip
          }
        }
      });
      res.on("end", () => resolve(results));
      res.on("error", reject);
    });
    
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });

  // Yield text-delta events
  for (const event of events) {
    yield event;
  }

  // Parse structured output for array mode
  if (params.mode === "array" && fullText) {
    try {
      const jsonMatch = fullText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const elements = JSON.parse(jsonMatch[0]);
        if (Array.isArray(elements)) {
          for (const el of elements) {
            yield { type: el.type || el.op || "element", ...el };
          }
          yield { type: "output", output: elements };
          return;
        }
      }
    } catch {
      // Fall through to text output
    }
  }

  yield { type: "output", output: fullText };
}
