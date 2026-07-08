/**
 * Zara — E2E Testing Agent
 *
 * - spawnChild "pw" actor at machine entry — holds MCP Client for entire run
 * - "pw" actor uses @modelcontextprotocol/sdk Client + StreamableHTTPClientTransport
 * - Login is a separate state with explicit steps (navigate, fill, click, verify)
 * - AI thinking/acting loop for post-login phases
 */

import { assign, emit, fromCallback, fromPromise, sendTo, setup, spawnChild } from "https://esm.sh/xstate";
import { Client } from "https://esm.sh/@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "https://esm.sh/@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─── Playwright MCP actor ───────────────────────────────────────────────────
// Long-lived callback actor. Owns the MCP Client instance.
// Receives: { type: "init" } | { type: "call", tool, args }
// Sends:    { type: "pw.ready", tools } | { type: "pw.result", tool, result, error }

const playwrightActor = fromCallback(({ sendBack, receive, input }) => {
  const client = new Client({ name: "zara", version: "1.0" });
  let connected = false;

  receive(async (event) => {
    if (event.type === "init") {
      try {
        const transport = new StreamableHTTPClientTransport(new URL(input.url));
        await client.connect(transport);
        connected = true;
        const { tools } = await client.listTools();
        sendBack({ type: "pw.ready", tools: tools || [] });
      } catch (e) {
        sendBack({ type: "pw.error", error: e.message });
      }
    }
    else if (event.type === "call") {
      if (!connected) { sendBack({ type: "pw.result", tool: event.tool, error: "Not connected" }); return; }
      try {
        const result = await client.callTool({ name: event.tool, arguments: event.args || {} });
        const text = result?.content?.map(c => c.text || c.data || "").join("\n") || JSON.stringify(result);
        sendBack({ type: "pw.result", tool: event.tool, args: event.args, result: text });
      } catch (e) {
        sendBack({ type: "pw.result", tool: event.tool, args: event.args, error: e.message });
      }
    }
  });

  return () => { if (connected) client.close().catch(() => {}); };
});

// ─── AI actor ───────────────────────────────────────────────────────────────

const aiDecide = fromPromise(async ({ input }) => {
  const baseUrl = globalThis.process?.env?.OPENAI_BASE_URL || "http://ai-core-proxy:3030/v1";
  const apiKey = globalThis.process?.env?.OPENAI_API_KEY || "proxy";
  const model = globalThis.process?.env?.AI_MODEL || "gpt-4o";
  const res = await globalThis.fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }], max_tokens: 300, temperature: 0.1 }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).substring(0, 200)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  return tools.map(t => `- ${t.name}: ${t.description || ""}`).join("\n");
}

function parseToolCall(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) { try { const o = JSON.parse(text.substring(start, i + 1)); if (o.tool) return o; } catch {} break; } }
  }
  return null;
}

function buildSystemPrompt(ctx) {
  return `You are Zara, browser automation agent. Tools:\n${ctx.toolCatalog}\n\nRespond JSON only: {"tool":"name","args":{...}}\nWhen done: {"tool":"__done__","args":{}}\n\nPhase: ${ctx.phase}\n- create: type prompt in chat, submit. Done when URL has /solutions/<uuid>\n- intent: answer. Done when Intent ✓\n- requirements: wait. Done when Requirements ✓\n- solution: wait. Done when Try/Test\n- testing: test. Done when Deploy enabled\n- deployment: deploy. Done when Running\n- deployed: verify. Done when responds`;
}

function buildUserPrompt(ctx) {
  const parts = [`Phase: ${ctx.phase}`, `Turn: ${ctx.turn}`];
  if (ctx.lastSnapshot) parts.push(`Page:\n${ctx.lastSnapshot.substring(0, 3000)}`);
  if (ctx.history.length) parts.push(`Recent:\n${ctx.history.slice(-5).map(h => `[${h.tool}] ${(h.error || h.result || "").substring(0, 150)}`).join("\n")}`);
  else parts.push("Start with browser_snapshot.");
  return parts.join("\n\n");
}

// ─── Machine ────────────────────────────────────────────────────────────────

export const machine = setup({
  actors: { playwrightActor, aiDecide },
  types: { input: {}, context: {}, emitted: {} },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    tools: [], toolCatalog: "",
    projectId: input?.projectId || "", prompt: input?.prompt || "",
    phase: "create", lastSnapshot: "", history: [],
    pendingAction: null, error: null, retries: 0, turn: 0, maxTurns: 50,
    loginStep: 0, ...input,
  }),

  entry: [
    emit({ type: "message", data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100"><header class="sticky top-0 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4"><span class="text-lg font-semibold text-purple-400">Zara</span><span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span></header><div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div><form class="mt-4 flex gap-2"><input type="text" name="prompt" placeholder="What to test..." class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg"/><button type="submit" hx-post="events/request" class="px-6 py-3 bg-purple-600 rounded-lg">Start</button></form></main>` }),
    spawnChild("playwrightActor", {
      id: "pw", systemId: "pw",
      input: { url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp" },
    }),
  ],

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: { request: { target: "initializing", actions: assign({
        prompt: ({ event }) => event.prompt || "", projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
        error: () => null, retries: () => 0, turn: () => 0, history: () => [], phase: () => "create", loginStep: () => 0,
      })}},
    },

    // ═══ INIT MCP CLIENT ═════════════════════════════════════════════════════
    initializing: {
      entry: [
        emit({ type: "@status", data: `<span class="text-yellow-400">● init</span>` }),
        sendTo("pw", { type: "init" }),
      ],
      on: {
        "pw.ready": { target: "login_navigate", actions: assign({
          tools: ({ event }) => event.tools,
          toolCatalog: ({ event }) => buildToolCatalog(event.tools),
        })},
        "pw.error": { target: "error", actions: assign({ error: ({ event }) => event.error }) },
      },
    },

    // ═══ LOGIN STEP 1: Navigate to Joule Studio ═════════════════════════════
    login_navigate: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● login</span> navigate` }),
        sendTo("pw", () => ({
          type: "call", tool: "browser_navigate",
          args: { url: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build" },
        })),
      ],
      on: {
        "pw.result": { target: "login_wait", actions: emit({ type: "@progress", data: `<div class="text-xs text-gray-400">Navigated to Studio</div>` }) },
      },
    },

    // ═══ LOGIN STEP 2: Wait for page load ════════════════════════════════════
    login_wait: {
      entry: sendTo("pw", { type: "call", tool: "browser_wait_for", args: { time: 3 } }),
      on: { "pw.result": "login_fill" },
    },

    // ═══ LOGIN STEP 3: Fill credentials via Playwright code ══════════════════
    login_fill: {
      entry: [
        emit({ type: "@progress", data: `<div class="text-xs text-blue-300">Filling login form...</div>` }),
        sendTo("pw", () => ({
          type: "call", tool: "browser_run_code_unsafe",
          args: { code: `async (page) => { const u = '${globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com"}'; const p = '${globalThis.process?.env?.IAS_PASSWORD || "openCODE1!"}'; try { const e = page.locator('input[type="email"], input[type="text"], input[name*="user"]').first(); await e.fill(u); const b = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first(); await b.click(); await page.waitForTimeout(2000); const pw = page.locator('input[type="password"]').first(); await pw.fill(p); const s = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first(); await s.click(); await page.waitForTimeout(5000); } catch(err) { /* might already be logged in */ } return page.url(); }` },
        })),
      ],
      on: { "pw.result": "login_verify" },
    },

    // ═══ LOGIN STEP 4: Verify with snapshot ══════════════════════════════════
    login_verify: {
      entry: sendTo("pw", { type: "call", tool: "browser_snapshot", args: {} }),
      on: {
        "pw.result": {
          target: "thinking",
          actions: [
            assign({
              lastSnapshot: ({ event }) => event.result || "",
              history: ({ event }) => [{ tool: "login", result: (event.result || "").substring(0, 200) }],
            }),
            emit({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Login done</div>` }),
          ],
        },
      },
    },

    // ═══ THINKING: AI decides next action ════════════════════════════════════
    thinking: {
      entry: [
        assign({ turn: ({ context }) => context.turn + 1 }),
        emit(({ context }) => ({ type: "@status", data: `<span class="text-blue-400">● ${context.phase}</span> t${context.turn}` })),
      ],
      always: { guard: ({ context }) => context.turn > context.maxTurns, target: "error", actions: assign({ error: () => "Max turns" }) },
      invoke: {
        src: "aiDecide",
        input: ({ context }) => ({ system: buildSystemPrompt(context), prompt: buildUserPrompt(context) }),
        onDone: [
          { guard: ({ event }) => { const p = parseToolCall(event.output || ""); return !p || p.tool === "__done__"; }, target: "transition" },
          { target: "acting", actions: assign({ pendingAction: ({ event }) => parseToolCall(event.output || "") || { tool: "browser_snapshot", args: {} } }) },
        ],
        onError: { target: "error", actions: assign({ error: ({ event }) => `AI: ${event.error?.message}` }) },
      },
    },

    // ═══ ACTING: execute tool via pw actor ═══════════════════════════════════
    acting: {
      entry: [
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${context.pendingAction?.tool}(${JSON.stringify(context.pendingAction?.args || {}).substring(0, 60)})</div>` })),
        sendTo("pw", ({ context }) => ({ type: "call", tool: context.pendingAction.tool, args: context.pendingAction.args || {} })),
      ],
      on: {
        "pw.result": {
          target: "thinking",
          actions: [
            assign({
              history: ({ context, event }) => [...context.history, { tool: event.tool, result: event.result, error: event.error }],
              lastSnapshot: ({ context, event }) => event.tool === "browser_snapshot" ? (event.result || context.lastSnapshot) : context.lastSnapshot,
              pendingAction: () => null,
            }),
            emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-gray-500">← ${(event.error || event.result || "").substring(0, 80)}</div>` })),
          ],
        },
      },
    },

    // ═══ TRANSITION ══════════════════════════════════════════════════════════
    transition: {
      entry: emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-green-400 font-semibold">✓ ${context.phase}</div>` })),
      always: [
        { guard: ({ context }) => context.phase === "create", target: "thinking", actions: assign({ phase: () => "intent", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "intent", target: "thinking", actions: assign({ phase: () => "requirements", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "requirements", target: "thinking", actions: assign({ phase: () => "solution", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "solution", target: "thinking", actions: assign({ phase: () => "testing", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "testing", target: "thinking", actions: assign({ phase: () => "deployment", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "deployment", target: "thinking", actions: assign({ phase: () => "deployed", turn: () => 0 }) },
        { guard: ({ context }) => context.phase === "deployed", target: "done" },
        { target: "done" },
      ],
    },

    // ═══ DONE ════════════════════════════════════════════════════════════════
    done: { type: "final", entry: [
      emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
      emit(({ context }) => ({ type: "@progress", data: `<div class="text-sm text-green-400 font-bold mt-4">✓ ${context.history.length} actions</div>` })),
    ]},

    // ═══ ERROR ═══════════════════════════════════════════════════════════════
    error: {
      entry: [
        emit(({ context }) => ({ type: "@status", data: `<span class="text-red-400">● error</span>` })),
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-red-400">✗ ${context.error}</div>` })),
      ],
      on: {
        retry: { guard: ({ context }) => context.retries < 3, target: "initializing", actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }) },
        request: { target: "initializing", actions: assign({ prompt: ({ event }) => event.prompt || "", error: () => null, retries: () => 0, turn: () => 0, history: () => [] }) },
      },
    },
  },
});

export default machine;
