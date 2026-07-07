/**
 * Zara — E2E Testing Agent (Serverless Handler)
 *
 * Flat XState machine that drives Joule Studio E2E testing via Playwright MCP.
 *
 * Architecture:
 *   - On init: connects to Playwright MCP, lists available tools, stores in context
 *   - AI stream uses tool schemas as element schema → AI emits tool-call elements
 *   - On "playwright.*" events: downstream MCP tool call, result feeds back as context
 *   - State transitions driven by AI observing page state via snapshots
 *
 * States: idle → connecting → authenticating → create → intent →
 *         requirements → solution → testing → deployment → deployed → done
 */

import { assign, emit, fromCallback, fromPromise, setup } from "https://esm.sh/xstate";
import { fromAIEventStream, fromAIElementStream } from "https://esm.sh/@cxai/stream";
import { z } from "https://esm.sh/zod";

// ─── Playwright MCP Client (HTTP streamable transport) ──────────────────────

class PlaywrightMCP {
  #url;
  #sessionId = null;
  tools = [];

  constructor(url) {
    this.#url = url;
  }

  async call(method, params = {}) {
    const res = await fetch(this.#url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...(this.#sessionId ? { "Mcp-Session-Id": this.#sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.#sessionId = sid;

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
            if (msg.result !== undefined) return msg.result;
          } catch (e) { if (e.message && !e.message.includes("JSON")) throw e; }
        }
      }
      throw new Error("No result in SSE response");
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MCP ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async init() {
    const result = await this.call("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "zara", version: "1.0" },
    });
    // List tools after init
    const toolsResult = await this.call("tools/list", {});
    this.tools = toolsResult?.tools || [];
    return result;
  }

  async tool(name, args = {}) {
    return this.call("tools/call", { name, arguments: args });
  }

  async close() { try { await this.tool("browser_close"); } catch {} }

  get id() { return this.#sessionId; }
}

// ─── Build Zod schema from MCP tool definitions ─────────────────────────────

/**
 * Convert MCP tool list into a Zod discriminated union schema.
 * Each tool becomes an element the AI can emit:
 *   { tool: "browser_navigate", args: { url: "..." } }
 */
function buildToolCallSchema(tools) {
  // Simple schema: the AI picks a tool name and provides args
  return z.object({
    tool: z.enum(tools.map(t => t.name)).describe("The Playwright MCP tool to call"),
    args: z.record(z.any()).describe("Arguments for the tool call"),
    reasoning: z.string().optional().describe("Why this tool call is needed"),
  }).describe("A Playwright browser action to perform");
}

/**
 * Build a tool catalog string for the AI system prompt.
 */
function buildToolCatalog(tools) {
  return tools.map(t => {
    const params = t.inputSchema?.properties
      ? Object.entries(t.inputSchema.properties)
        .map(([k, v]) => `  ${k}: ${v.description || v.type || "any"}`)
        .join("\n")
      : "  (no parameters)";
    return `### ${t.name}\n${t.description || ""}\nParameters:\n${params}`;
  }).join("\n\n");
}

// ─── Actors ─────────────────────────────────────────────────────────────────

const connectPlaywright = fromPromise(async ({ input }) => {
  const pw = new PlaywrightMCP(input.url);
  await pw.init();
  return { pw, tools: pw.tools };
});

/**
 * Execute a Playwright MCP tool call.
 * Used as the downstream handler for playwright.* events.
 */
const execPlaywrightTool = fromPromise(async ({ input }) => {
  const { pw, tool, args } = input;
  const result = await pw.tool(tool, args || {});
  return { tool, result };
});

// ─── The Machine ────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    connectPlaywright,
    execPlaywrightTool,
    aiStream: fromAIElementStream(),
    aiChat: fromAIEventStream(),
  },
  types: {
    input: {},
    context: {},
    emitted: {},
  },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    // Playwright MCP
    pw: null,
    tools: [],          // MCP tool definitions
    toolCatalog: "",    // Formatted tool descriptions for AI prompt
    toolSchema: null,   // Zod schema built from tools

    // Session
    projectId: input?.projectId || "",
    prompt: input?.prompt || "",
    solutionId: null,
    solutionUrl: null,

    // Browser state (updated after each tool call)
    lastSnapshot: null,
    lastScreenshot: null,
    lastUrl: "",

    // History of tool calls + results (fed back to AI)
    history: [],

    // State
    error: null,
    retries: 0,
    ...input,
  }),

  // Initial UI
  entry: emit({
    type: "message",
    data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100">
      <header class="sticky top-0 z-10 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4">
        <span class="text-lg font-semibold text-purple-400">Zara — E2E Tester</span>
        <span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span>
      </header>
      <div class="mt-4 space-y-2" sse-swap="@progress" hx-swap="beforeend"></div>
      <div class="mt-2" sse-swap="@snapshot" hx-swap="innerHTML"></div>
      <form class="mt-4 flex gap-2">
        <input type="text" name="prompt" placeholder="Describe what to test..."
               class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg" />
        <button type="submit" hx-post="events/request"
                class="px-6 py-3 bg-purple-600 rounded-lg hover:bg-purple-700">Start</button>
      </form>
    </main>`,
  }),

  states: {
    // ─── Idle ─────────────────────────────────────────────────────────────
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: {
        request: {
          target: "connecting",
          actions: assign({
            prompt: ({ event }) => event.prompt || "",
            projectId: ({ event }) => event.projectId || `session-${Date.now()}`,
            error: () => null,
            retries: () => 0,
            history: () => [],
            lastSnapshot: () => null,
          }),
        },
      },
    },

    // ─── Connect to Playwright MCP + list tools ───────────────────────────
    connecting: {
      entry: emit({ type: "@status", data: `<span class="text-yellow-400">● connecting</span>` }),
      invoke: {
        src: "connectPlaywright",
        input: () => ({
          url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp:8931/mcp",
        }),
        onDone: {
          target: "authenticating",
          actions: [
            assign({
              pw: ({ event }) => event.output.pw,
              tools: ({ event }) => event.output.tools,
              toolCatalog: ({ event }) => buildToolCatalog(event.output.tools),
              toolSchema: ({ event }) => buildToolCallSchema(event.output.tools),
            }),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-green-400">✓ Connected — ${event.output.tools.length} tools available</div>`,
            })),
          ],
        },
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `Connection failed: ${event.error?.message || "unknown"}` }),
        },
      },
    },

    // ─── Authenticating: AI drives login via tool calls ───────────────────
    authenticating: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● authenticating</span>` }),
        emit({ type: "@progress", data: `<div class="text-xs text-gray-400">AI driving IAS login...</div>` }),
      ],
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. You have access to these Playwright MCP tools:

${context.toolCatalog}

Your task: Log into Joule Studio.
1. Navigate to ${globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com"}/new/build
2. If you see a login page (IAS), fill email "${globalThis.process?.env?.IAS_USERNAME || ""}" and password "${globalThis.process?.env?.IAS_PASSWORD || ""}"
3. Click Continue/Sign In/Log On
4. Wait for redirect to Studio

Emit tool calls one at a time. After each, you'll see the result in the next turn.
When login is complete (you see Conversations/Spaces/Develop in snapshot), emit a tool call with tool="__done__" and args={}.

Current page state:
${context.lastSnapshot ? JSON.stringify(context.lastSnapshot).substring(0, 2000) : "No page loaded yet"}

Previous actions:
${context.history.map(h => `→ ${h.tool}(${JSON.stringify(h.args)}) = ${JSON.stringify(h.result).substring(0, 200)}`).join("\n") || "None"}`,
          template: "Perform the next browser action to log in.",
        }),
      },
      on: {
        // AI emits tool-call elements → execute on Playwright MCP
        "*": {
          actions: [
            // Forward to playwright execution
            emit(({ event }) => ({
              type: `playwright.${event.tool}`,
              event: `playwright.${event.tool}`,
              data: JSON.stringify({ tool: event.tool, args: event.args, reasoning: event.reasoning }),
            })),
            // Show progress
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-blue-300">→ ${event.tool}(${JSON.stringify(event.args || {}).substring(0, 100)})</div>`,
            })),
          ],
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        // AI signals done
        output: {
          target: "create",
          actions: [
            emit({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Authenticated</div>` }),
          ],
        },
      },
    },

    // ─── Create: AI prompts Joule Studio ──────────────────────────────────
    create: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● create</span>` }),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-xs text-gray-400">Prompting Joule: "${(context.prompt || "").substring(0, 60)}"</div>`,
        })),
      ],
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent with these tools:

${context.toolCatalog}

Your task: Create a new solution in Joule Studio.
1. Find the chat input (placeholder "Message Joule..." or textbox role)
2. Type the solution description: "${context.prompt}"
3. Submit (Enter or click Send)
4. Answer any clarifying questions Joule asks
5. When the URL changes to contain a solution UUID (/solutions/xxxxxxxx-...), emit tool="__done__" args={"solutionId": "<uuid>", "solutionUrl": "<url>"}

Current snapshot:
${context.lastSnapshot ? JSON.stringify(context.lastSnapshot).substring(0, 3000) : ""}

History:
${context.history.slice(-5).map(h => `→ ${h.tool}: ${JSON.stringify(h.result).substring(0, 150)}`).join("\n")}`,
          template: "Perform the next action to create the solution in Joule.",
        }),
      },
      on: {
        "*": {
          actions: [
            emit(({ event }) => ({
              type: `playwright.${event.tool}`,
              event: `playwright.${event.tool}`,
              data: JSON.stringify({ tool: event.tool, args: event.args }),
            })),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-blue-300">→ ${event.tool}(${JSON.stringify(event.args || {}).substring(0, 80)})</div>`,
            })),
          ],
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: {
          target: "intent",
          actions: assign({
            solutionId: ({ event }) => event.output?.[0]?.args?.solutionId || null,
            solutionUrl: ({ event }) => event.output?.[0]?.args?.solutionUrl || null,
          }),
        },
      },
    },

    // ─── Intent ───────────────────────────────────────────────────────────
    intent: {
      entry: emit({ type: "@status", data: `<span class="text-indigo-400">● intent</span>` }),
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. Tools:\n${context.toolCatalog}\n\nTask: Monitor Joule Studio Intent phase. Take snapshots. When Intent step shows ✓ or Requirements becomes active, emit tool="__done__". Current: ${JSON.stringify(context.lastSnapshot).substring(0, 2000)}`,
          template: "Check if Intent phase is complete.",
        }),
      },
      on: {
        "*": {
          actions: emit(({ event }) => ({
            type: `playwright.${event.tool}`,
            event: `playwright.${event.tool}`,
            data: JSON.stringify({ tool: event.tool, args: event.args }),
          })),
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: { target: "requirements" },
      },
    },

    // ─── Requirements ─────────────────────────────────────────────────────
    requirements: {
      entry: emit({ type: "@status", data: `<span class="text-indigo-400">● requirements</span>` }),
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. Tools:\n${context.toolCatalog}\n\nTask: Monitor Joule Requirements phase. When Requirements ✓ or Solution becomes active, emit tool="__done__". Snapshot: ${JSON.stringify(context.lastSnapshot).substring(0, 2000)}`,
          template: "Check requirements phase.",
        }),
      },
      on: {
        "*": {
          actions: emit(({ event }) => ({
            type: `playwright.${event.tool}`,
            event: `playwright.${event.tool}`,
            data: JSON.stringify({ tool: event.tool, args: event.args }),
          })),
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: { target: "solution" },
      },
    },

    // ─── Solution ─────────────────────────────────────────────────────────
    solution: {
      entry: emit({ type: "@status", data: `<span class="text-indigo-400">● solution</span>` }),
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. Tools:\n${context.toolCatalog}\n\nTask: Monitor Solution generation. When Solution ✓ or Try/Test button appears, emit tool="__done__". Snapshot: ${JSON.stringify(context.lastSnapshot).substring(0, 2000)}`,
          template: "Check solution phase.",
        }),
      },
      on: {
        "*": {
          actions: emit(({ event }) => ({
            type: `playwright.${event.tool}`,
            event: `playwright.${event.tool}`,
            data: JSON.stringify({ tool: event.tool, args: event.args }),
          })),
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: { target: "testing" },
      },
    },

    // ─── Testing ──────────────────────────────────────────────────────────
    testing: {
      entry: emit({ type: "@status", data: `<span class="text-orange-400">● testing</span>` }),
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. Tools:\n${context.toolCatalog}\n\nTask: Test the solution in sandbox. Click Try/Test, send a test message, verify response. When tests pass (Deploy button enabled), emit tool="__done__". Snapshot: ${JSON.stringify(context.lastSnapshot).substring(0, 2000)}`,
          template: "Run sandbox tests.",
        }),
      },
      on: {
        "*": {
          actions: emit(({ event }) => ({
            type: `playwright.${event.tool}`,
            event: `playwright.${event.tool}`,
            data: JSON.stringify({ tool: event.tool, args: event.args }),
          })),
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: { target: "deployment" },
      },
    },

    // ─── Deployment ───────────────────────────────────────────────────────
    deployment: {
      entry: emit({ type: "@status", data: `<span class="text-orange-400">● deployment</span>` }),
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. Tools:\n${context.toolCatalog}\n\nTask: Deploy the solution. Click Deploy, wait for status=Running/Deployed. When deployed, emit tool="__done__". Snapshot: ${JSON.stringify(context.lastSnapshot).substring(0, 2000)}`,
          template: "Deploy the solution.",
        }),
      },
      on: {
        "*": {
          actions: emit(({ event }) => ({
            type: `playwright.${event.tool}`,
            event: `playwright.${event.tool}`,
            data: JSON.stringify({ tool: event.tool, args: event.args }),
          })),
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: { target: "deployed" },
      },
    },

    // ─── Deployed: verify ─────────────────────────────────────────────────
    deployed: {
      entry: emit({ type: "@status", data: `<span class="text-cyan-400">● deployed</span>` }),
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: context.toolSchema,
          system: `You are a browser automation agent. Tools:\n${context.toolCatalog}\n\nTask: Verify the deployed solution. Navigate to Conversations, @mention the agent, send a test message. If response is sensible, emit tool="__done__". Snapshot: ${JSON.stringify(context.lastSnapshot).substring(0, 2000)}`,
          template: "Verify deployment.",
        }),
      },
      on: {
        "*": {
          actions: emit(({ event }) => ({
            type: `playwright.${event.tool}`,
            event: `playwright.${event.tool}`,
            data: JSON.stringify({ tool: event.tool, args: event.args }),
          })),
          guard: ({ event }) => event.tool && event.tool !== "__done__" && event.type !== "output",
        },
        output: { target: "done" },
      },
    },

    // ─── Done ─────────────────────────────────────────────────────────────
    done: {
      type: "final",
      entry: [
        emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-sm text-green-400 font-semibold">✓ Complete — ${context.history.length} actions performed</div>`,
        })),
      ],
    },

    // ─── Error ────────────────────────────────────────────────────────────
    error: {
      entry: [
        emit(({ context }) => ({
          type: "@status",
          data: `<span class="text-red-400">● error</span> — ${context.error || "Unknown"}`,
        })),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-xs text-red-400">✗ ${context.error}</div>`,
        })),
      ],
      on: {
        retry: {
          guard: ({ context }) => context.retries < 3,
          target: "connecting",
          actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }),
        },
        request: {
          target: "connecting",
          actions: assign({
            prompt: ({ event }) => event.prompt || "",
            projectId: ({ event }) => event.projectId || `session-${Date.now()}`,
            error: () => null,
            retries: () => 0,
            history: () => [],
          }),
        },
      },
    },
  },

  // ─── Global event handler: playwright.* → execute MCP tool downstream ──
  on: {
    "playwright.*": {
      actions: [
        // Execute the tool call and store result in history
        assign({
          history: ({ context, event }) => {
            const data = typeof event.data === "string" ? JSON.parse(event.data) : event;
            // Fire-and-forget the actual MCP call — result updates context asynchronously
            if (context.pw && data.tool) {
              context.pw.tool(data.tool, data.args || {}).then(result => {
                // The result will be available on next AI invocation via context.history
                context.history.push({ tool: data.tool, args: data.args, result, ts: Date.now() });
                // Update snapshot if it was a snapshot/navigate call
                if (data.tool === "browser_snapshot") context.lastSnapshot = result;
                if (data.tool === "browser_navigate") context.lastUrl = data.args?.url || context.lastUrl;
              }).catch(err => {
                context.history.push({ tool: data.tool, args: data.args, error: err.message, ts: Date.now() });
              });
            }
            return context.history;
          },
        }),
      ],
    },
  },
});

export default machine;
