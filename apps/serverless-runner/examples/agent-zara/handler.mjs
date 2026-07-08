/**
 * Zara — E2E Testing Agent (Serverless Handler)
 *
 * Architecture:
 *   - On request: connects to Playwright MCP, lists tools, stores in context
 *   - Each workflow state is a LOOP: AI proposes tool call → execute on MCP → feed result back
 *   - Loop repeats until AI emits __done__ → transitions to next state
 *   - playwright.* events on the wildcard handler execute MCP calls synchronously
 *
 * The key pattern is: thinking → acting → thinking → acting → ... → transition
 *   "thinking" invokes AI with current snapshot + history → AI picks a tool
 *   "acting" executes that tool on Playwright MCP → stores result
 *   Loop back to "thinking" with updated context
 *
 * States: idle → connecting → authenticating → create → intent →
 *         requirements → solution → testing → deployment → deployed → done
 */

import { assign, emit, fromPromise, setup } from "https://esm.sh/xstate";

// ─── Playwright MCP Client ──────────────────────────────────────────────────

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
    await this.call("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "zara", version: "1.0" },
    });
    const toolsResult = await this.call("tools/list", {});
    this.tools = toolsResult?.tools || [];
  }

  async tool(name, args = {}) {
    return this.call("tools/call", { name, arguments: args });
  }

  async close() { try { await this.tool("browser_close"); } catch {} }
  get id() { return this.#sessionId; }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  return tools.map(t => {
    const params = t.inputSchema?.properties
      ? Object.entries(t.inputSchema.properties)
        .map(([k, v]) => `  ${k}: ${v.description || v.type || "any"}`)
        .join("\n")
      : "";
    return `- ${t.name}: ${t.description || ""}${params ? "\n" + params : ""}`;
  }).join("\n");
}

function formatHistory(history, limit = 10) {
  return history.slice(-limit).map(h =>
    `[${h.tool}] ${h.error ? "ERROR: " + h.error : JSON.stringify(h.result).substring(0, 300)}`
  ).join("\n");
}

// ─── Actors ─────────────────────────────────────────────────────────────────

const connectPlaywright = fromPromise(async ({ input }) => {
  const pw = new PlaywrightMCP(input.url);
  await pw.init();
  return { pw, tools: pw.tools };
});

/**
 * AI actor: calls OpenAI-compatible endpoint directly.
 * Uses OPENAI_BASE_URL (ai-core-proxy) with OPENAI_API_KEY.
 */
const aiDecide = fromPromise(async ({ input }) => {
  const baseUrl = globalThis.process?.env?.OPENAI_BASE_URL || "http://ai-core-proxy:3030/v1";
  const apiKey = globalThis.process?.env?.OPENAI_API_KEY || "proxy";
  const model = globalThis.process?.env?.AI_MODEL || "gpt-4o";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI ${res.status}: ${text.substring(0, 200)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "";
  return content;
});

/**
 * Execute a single Playwright MCP tool call and return the result.
 */
const execTool = fromPromise(async ({ input }) => {
  const { pw, tool, args } = input;
  try {
    const result = await pw.tool(tool, args || {});
    // Extract text content from MCP result
    const text = result?.content
      ?.map(c => c.text || c.data || "")
      .join("\n") || JSON.stringify(result);
    return { tool, args, result: text, error: null };
  } catch (e) {
    return { tool, args, result: null, error: e.message };
  }
});

// ─── The Machine ────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    connectPlaywright,
    execTool,
    aiDecide,
  },
  types: { input: {}, context: {}, emitted: {} },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    pw: null,
    tools: [],
    toolCatalog: "",
    projectId: input?.projectId || "",
    prompt: input?.prompt || "",
    phase: "authenticating",  // current workflow phase
    solutionId: null,
    solutionUrl: null,
    lastSnapshot: "",
    history: [],  // { tool, args, result, error }[]
    pendingAction: null,  // { tool, args } — next action to execute
    error: null,
    retries: 0,
    maxTurns: 50,
    turn: 0,
    ...input,
  }),

  entry: emit({
    type: "message",
    data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100">
      <header class="sticky top-0 z-10 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4">
        <span class="text-lg font-semibold text-purple-400">Zara — E2E Tester</span>
        <span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span>
      </header>
      <div class="mt-4 space-y-1 max-h-96 overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div>
      <form class="mt-4 flex gap-2">
        <input type="text" name="prompt" placeholder="Describe what to test..."
               class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg" />
        <button type="submit" hx-post="events/request"
                class="px-6 py-3 bg-purple-600 rounded-lg hover:bg-purple-700">Start</button>
      </form>
    </main>`,
  }),

  states: {
    // ═══════════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: {
        request: {
          target: "connecting",
          actions: assign({
            prompt: ({ event }) => event.prompt || "",
            projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
            error: () => null,
            retries: () => 0,
            turn: () => 0,
            history: () => [],
            phase: () => "authenticating",
            pendingAction: () => null,
            lastSnapshot: () => "",
          }),
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    connecting: {
      entry: emit({ type: "@status", data: `<span class="text-yellow-400">● connecting</span>` }),
      invoke: {
        src: "connectPlaywright",
        input: () => ({
          url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp:8931/mcp",
        }),
        onDone: {
          target: "thinking",
          actions: [
            assign({
              pw: ({ event }) => event.output.pw,
              tools: ({ event }) => event.output.tools,
              toolCatalog: ({ event }) => buildToolCatalog(event.output.tools),
            }),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-green-400">✓ Playwright connected (${event.output.tools.length} tools)</div>`,
            })),
          ],
        },
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `Connection: ${event.error?.message}` }),
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // THINKING: Ask AI what tool to call next
    // ═══════════════════════════════════════════════════════════════════════
    thinking: {
      entry: [
        assign({ turn: ({ context }) => context.turn + 1 }),
        emit(({ context }) => ({
          type: "@status",
          data: `<span class="text-blue-400">● ${context.phase}</span> — thinking (turn ${context.turn})`,
        })),
      ],
      always: {
        guard: ({ context }) => context.turn > context.maxTurns,
        target: "error",
        actions: assign({ error: () => "Max turns exceeded" }),
      },
      invoke: {
        src: "aiDecide",
        input: ({ context }) => ({
          system: buildSystemPrompt(context),
          prompt: buildUserPrompt(context),
        }),
        onDone: [
          {
            // AI said __done__ → move to next phase
            guard: ({ event }) => {
              const text = event.output || "";
              try {
                const m = text.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
                if (m) { const j = JSON.parse(m[0]); return j.tool === "__done__"; }
              } catch {}
              return !text.includes('"tool"');
            },
            target: "transition",
          },
          {
            // AI specified a tool → go execute it
            target: "acting",
            actions: assign({
              pendingAction: ({ event }) => {
                const text = event.output || "";
                try {
                  const m = text.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
                  if (m) return JSON.parse(m[0]);
                } catch {}
                return { tool: "browser_snapshot", args: {} };
              },
            }),
          },
        ],
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `AI: ${event.error?.message}` }),
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ACTING: Execute the tool call on Playwright MCP
    // ═══════════════════════════════════════════════════════════════════════
    acting: {
      entry: emit(({ context }) => ({
        type: "@progress",
        data: `<div class="text-xs text-blue-300">→ ${context.pendingAction?.tool}(${JSON.stringify(context.pendingAction?.args || {}).substring(0, 80)})</div>`,
      })),
      invoke: {
        src: "execTool",
        input: ({ context }) => ({
          pw: context.pw,
          tool: context.pendingAction.tool,
          args: context.pendingAction.args,
        }),
        onDone: {
          target: "thinking",  // Loop back to AI with result
          actions: [
            assign({
              history: ({ context, event }) => [...context.history, event.output],
              lastSnapshot: ({ context, event }) => {
                // Update snapshot if it was a snapshot call
                if (event.output.tool === "browser_snapshot") return event.output.result || context.lastSnapshot;
                return context.lastSnapshot;
              },
              pendingAction: () => null,
            }),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-gray-500">  ← ${(event.output.result || event.output.error || "").substring(0, 120)}</div>`,
            })),
          ],
        },
        onError: {
          target: "thinking",  // Even on error, loop back
          actions: assign({
            history: ({ context, event }) => [
              ...context.history,
              { tool: context.pendingAction?.tool, args: context.pendingAction?.args, result: null, error: event.error?.message },
            ],
            pendingAction: () => null,
          }),
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TRANSITION: Move to next workflow phase
    // ═══════════════════════════════════════════════════════════════════════
    transition: {
      always: [
        { guard: ({ context }) => context.phase === "authenticating", target: "thinking", actions: assign({ phase: () => "create", turn: () => 0, history: () => [] }) },
        { guard: ({ context }) => context.phase === "create", target: "thinking", actions: assign({ phase: () => "intent", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "intent", target: "thinking", actions: assign({ phase: () => "requirements", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "requirements", target: "thinking", actions: assign({ phase: () => "solution", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "solution", target: "thinking", actions: assign({ phase: () => "testing", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "testing", target: "thinking", actions: assign({ phase: () => "deployment", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "deployment", target: "thinking", actions: assign({ phase: () => "deployed", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "deployed", target: "done" },
        { target: "done" },
      ],
      entry: emit(({ context }) => ({
        type: "@progress",
        data: `<div class="text-xs text-green-400 font-semibold">✓ Phase complete: ${context.phase}</div>`,
      })),
    },

    // ═══════════════════════════════════════════════════════════════════════
    done: {
      type: "final",
      entry: [
        emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-sm text-green-400 font-bold mt-4">✓ All phases complete — ${context.history.length} actions in ${context.turn} turns</div>`,
        })),
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════
    error: {
      entry: [
        emit(({ context }) => ({ type: "@status", data: `<span class="text-red-400">● error — ${context.error}</span>` })),
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-red-400">✗ ${context.error}</div>` })),
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
            projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
            error: () => null, retries: () => 0, turn: () => 0, history: () => [],
          }),
        },
      },
    },
  },
});

// ─── Prompt Builders ────────────────────────────────────────────────────────

function buildSystemPrompt(context) {
  return `You are Zara, a browser automation agent testing Joule Studio.
You have access to these Playwright MCP tools:
${context.toolCatalog}

IMPORTANT: Respond with ONLY a JSON object specifying the next tool to call:
{"tool": "browser_navigate", "args": {"url": "..."}}

When the current phase objective is complete, respond with:
{"tool": "__done__", "args": {}}

Current phase: ${context.phase}
Phase objectives:
- authenticating: Navigate to ${globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com"}/new/build, login with ${globalThis.process?.env?.IAS_USERNAME || "user@example.com"} / ${globalThis.process?.env?.IAS_PASSWORD || "***"}. Done when you see Conversations/Spaces/Develop nav.
- create: Type the solution prompt in chat input, submit. Done when URL contains /solutions/<uuid>.
- intent: Answer Joule's clarifying questions. Done when Intent step shows ✓.
- requirements: Wait/answer. Done when Requirements shows ✓.
- solution: Wait for code generation. Done when Solution shows ✓ or Try/Test button appears.
- testing: Click Try, test the solution. Done when Deploy button is enabled.
- deployment: Click Deploy, wait. Done when status shows Running/Deployed.
- deployed: Verify in Conversations. Done when agent responds correctly.

RESPOND ONLY WITH JSON. No explanations.`;
}

function buildUserPrompt(context) {
  const parts = [`Phase: ${context.phase}`, `Turn: ${context.turn}`];
  if (context.prompt) parts.push(`Task: ${context.prompt}`);
  if (context.lastSnapshot) parts.push(`Current page snapshot:\n${context.lastSnapshot.substring(0, 3000)}`);
  if (context.history.length > 0) {
    parts.push(`Last ${Math.min(5, context.history.length)} actions:\n${formatHistory(context.history, 5)}`);
  } else {
    parts.push("No actions taken yet. Start by navigating or taking a snapshot.");
  }
  parts.push("\nRespond with the next tool call as JSON:");
  return parts.join("\n\n");
}

export default machine;
