/**
 * Zara — E2E Testing Agent
 *
 * pw actor: inits MCP on spawn (eager), proxies tool calls
 * acting state: uses fromAIElementStream — AI streams tool-call elements
 *   each element → sendTo("pw") → pw.result accumulates in history
 *   on "output" (stream done) → check if __done__ was called → transition or loop
 */

import { assign, emit, fromCallback, fromPromise, sendTo, setup, spawnChild } from "https://esm.sh/xstate";
import { fromAIElementStream } from "https://esm.sh/@cxai/stream";
import { z } from "https://esm.sh/zod";
import { Client } from "https://esm.sh/@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "https://esm.sh/@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─── Playwright MCP actor (eager init) ──────────────────────────────────────

const playwrightActor = fromCallback(({ sendBack, receive, input }) => {
  const client = new Client({ name: "zara", version: "1.0" });
  let connected = false;

  (async () => {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(input.url));
      await client.connect(transport);
      connected = true;
      const { tools } = await client.listTools();
      sendBack({ type: "pw.ready", tools: tools || [] });
    } catch (e) { sendBack({ type: "pw.error", error: e.message }); }
  })();

  receive(async (event) => {
    if (event.type === "call") {
      if (event.tool === "suggest_hint") {
        sendBack({ type: "pw.result", tool: "suggest_hint", args: event.args, result: `Hint: [${event.args?.phase}] ${event.args?.new_hint}` });
        return;
      }
      if (event.tool === "__done__") {
        sendBack({ type: "pw.result", tool: "__done__", args: event.args, result: "done" });
        return;
      }
      if (event.tool === "get_context") {
        // Alias for browser_snapshot — AI uses this to refresh its view mid-stream
        if (!connected) { sendBack({ type: "pw.result", tool: "get_context", error: "Not connected" }); return; }
        try {
          const result = await client.callTool({ name: "browser_snapshot", arguments: {} });
          const text = result?.content?.map(c => c.text || c.data || "").join("\n") || "";
          sendBack({ type: "pw.result", tool: "get_context", args: {}, result: text });
        } catch (e) { sendBack({ type: "pw.result", tool: "get_context", error: e.message }); }
        return;
      }
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

// ─── Tool call schema for AI element stream ─────────────────────────────────

const toolCallSchema = z.object({
  tool: z.string().describe("Tool to call: browser_navigate, browser_snapshot, browser_click, browser_type, browser_run_code_unsafe, browser_wait_for, get_context, suggest_hint, __done__"),
  args: z.record(z.any()).describe("Tool arguments"),
  reasoning: z.string().optional().describe("Why this action"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  const pw = tools.map(t => `- ${t.name}: ${t.description || ""}`).join("\n");
  return `${pw}\n- get_context: Request fresh snapshot + current URL (use between actions to see results)\n- suggest_hint: Save UI hint for future runs. Args: {phase, old_hint, new_hint}\n- __done__: Phase complete. Args: {}`;
}

function formatTimeline(history) {
  return history.slice(-8).map(h => {
    const t = new Date(h.ts).toISOString().slice(11, 19);
    const status = h.error ? `ERROR: ${h.error.substring(0, 80)}` : (h.result || "ok").substring(0, 120);
    return `[${t}][${h.phase}] ${h.tool}(${JSON.stringify(h.args || {}).substring(0, 50)}) → ${status}`;
  }).join("\n");
}

// ─── Machine ────────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    playwrightActor,
    aiStream: fromAIElementStream(),
  },
  types: { input: {}, context: {}, emitted: {} },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    tools: [], toolCatalog: "",
    projectId: input?.projectId || "", prompt: input?.prompt || "",
    phase: "create", lastSnapshot: "", history: [],
    error: null, retries: 0, turn: 0, maxTurns: 50,
    hints: "", hintSuggestions: [],
    phaseDone: false,
    ...input,
  }),

  entry: [
    emit({ type: "message", data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100"><header class="sticky top-0 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4"><span class="text-lg font-semibold text-purple-400">Zara</span><span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span></header><div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div><form class="mt-4 flex gap-2"><input type="text" name="prompt" placeholder="What to test..." class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg"/><button type="submit" hx-post="events/request" class="px-6 py-3 bg-purple-600 rounded-lg">Start</button></form></main>` }),
    spawnChild("playwrightActor", {
      id: "pw", systemId: "pw",
      input: { url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp" },
    }),
  ],

  on: {
    "pw.ready": { actions: [
      assign({ tools: ({ event }) => event.tools, toolCatalog: ({ event }) => buildToolCatalog(event.tools) }),
      emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Playwright: ${event.tools.length} tools</div>` })),
    ]},
    "pw.error": { target: ".error", actions: assign({ error: ({ event }) => `PW: ${event.error}` }) },
    // pw.result arrives while AI stream is running — accumulate in timeline
    "pw.result": { actions: [
      assign({
        history: ({ context, event }) => [...context.history, {
          tool: event.tool,
          args: event.args,
          result: event.result,
          error: event.error,
          ts: Date.now(),
          phase: context.phase,
          turn: context.turn,
        }],
        lastSnapshot: ({ context, event }) => (event.tool === "browser_snapshot" || event.tool === "get_context") ? (event.result || context.lastSnapshot) : context.lastSnapshot,
        phaseDone: ({ context, event }) => event.tool === "__done__" ? true : context.phaseDone,
        hints: ({ context, event }) => event.tool === "suggest_hint" ? (context.hints || "") + `\n[${event.args?.phase}] ${event.args?.new_hint || ""}` : context.hints,
        hintSuggestions: ({ context, event }) => event.tool === "suggest_hint" ? [...(context.hintSuggestions || []), event.args] : context.hintSuggestions,
      }),
      emit(({ event }) => ({
        type: "@progress",
        data: event.tool === "suggest_hint"
          ? `<div class="text-xs text-amber-400">💡 ${event.args?.new_hint || ""}</div>`
          : `<div class="text-xs text-gray-500">← [${event.tool}] ${(event.error || event.result || "").substring(0, 80)}</div>`,
      })),
    ]},
  },

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: { request: { target: "login_navigate", actions: assign({
        prompt: ({ event }) => event.prompt || "", projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
        error: () => null, retries: () => 0, turn: () => 0, history: () => [],
        phase: () => "create", hints: () => "", hintSuggestions: () => [], phaseDone: () => false,
      })}},
    },

    // ═══ LOGIN ═══════════════════════════════════════════════════════════════
    login_navigate: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● login</span>` }),
        sendTo("pw", () => ({ type: "call", tool: "browser_navigate", args: { url: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build" } })),
      ],
      on: { "pw.result": "login_wait" },
    },
    login_wait: {
      entry: sendTo("pw", { type: "call", tool: "browser_wait_for", args: { time: 3 } }),
      on: { "pw.result": "login_fill" },
    },
    login_fill: {
      entry: [
        emit({ type: "@progress", data: `<div class="text-xs text-blue-300">Logging in...</div>` }),
        sendTo("pw", () => ({ type: "call", tool: "browser_run_code_unsafe", args: { code: `async (page) => { const u = '${globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com"}'; const p = '${globalThis.process?.env?.IAS_PASSWORD || "openCODE1!"}'; try { const e = page.locator('input[type="email"], input[type="text"], input[name*="user"]').first(); await e.fill(u); const b = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first(); await b.click(); await page.waitForTimeout(2000); const pw = page.locator('input[type="password"]').first(); await pw.fill(p); const s = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first(); await s.click(); await page.waitForTimeout(5000); } catch(err) {} return page.url(); }` } })),
      ],
      on: { "pw.result": "login_verify" },
    },
    login_verify: {
      entry: sendTo("pw", { type: "call", tool: "browser_snapshot", args: {} }),
      on: { "pw.result": { target: "acting", actions: [
        assign({ lastSnapshot: ({ event }) => event.result || "" }),
        emit({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Login done</div>` }),
      ]}},
    },

    // ═══ ACTING: AI streams tool calls, each gets executed ════════════════════
    acting: {
      entry: [
        assign({ turn: ({ context }) => context.turn + 1, phaseDone: () => false }),
        emit(({ context }) => ({ type: "@status", data: `<span class="text-blue-400">● ${context.phase}</span> t${context.turn}` })),
      ],
      always: { guard: ({ context }) => context.turn > context.maxTurns, target: "error", actions: assign({ error: () => "Max turns" }) },
      invoke: {
        src: "aiStream",
        input: ({ context }) => ({
          schema: toolCallSchema,
          system: `You are Zara, a browser automation agent testing Joule Studio.
You emit a SEQUENCE of tool calls. Each is executed immediately on the browser.

RULES:
1. Start with get_context or browser_snapshot if you need to see the page
2. Use "target" with element refs from snapshot (ref=e22 → target:"e22")
3. URL is the most reliable completion signal — check it in snapshot
4. If errors repeat, use browser_run_code_unsafe as fallback
5. Emit __done__ LAST when phase objective is met
6. Use get_context between actions to see updated page state
7. If a hint is outdated, emit suggest_hint then continue

PHASE: {{phase}}
TASK: {{prompt}}

OBJECTIVES:
- create: Type prompt in chat, submit. DONE when URL has /solutions/<uuid>
- intent: Answer Joule questions. DONE when stepper advances past Intent
- requirements: Wait/answer. DONE when stepper advances
- solution: Wait for code gen. DONE when Try/Test/Deploy visible
- testing: Test in sandbox. DONE when Deploy enabled
- deployment: Deploy. DONE when Running/Deployed
- deployed: Verify. DONE when agent responds

HINTS:
- Chat input often in shadow DOM — use browser_run_code_unsafe:
  async (page) => { await page.locator('[placeholder*="Message"], textarea, [contenteditable]').first().fill('text'); await page.keyboard.press('Enter'); }
- Wait 3-5s after page-changing actions, then get_context
- If URL already has /solutions/ → emit __done__
{{#hints}}
LEARNED:
{{hints}}
{{/hints}}

TOOLS:
{{toolCatalog}}`,
          template: `Phase: {{phase}} | Turn: {{turn}}/{{maxTurns}}

{{#lastSnapshot}}
Current page:
{{lastSnapshot}}
{{/lastSnapshot}}

{{#history.length}}
Timeline:
${formatTimeline(context.history)}
{{/history.length}}
{{^history.length}}
No actions yet — start with get_context to see the page.
{{/history.length}}`,
        }),
      },
      on: {
        "*": {
          guard: ({ event }) => !!event.tool && event.type !== "output",
          actions: [
            emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${event.tool}(${JSON.stringify(event.args || {}).substring(0, 60)})</div>` })),
            sendTo("pw", ({ event }) => ({ type: "call", tool: event.tool, args: event.args || {} })),
          ],
        },
        output: [
          { guard: ({ context }) => context.phaseDone, target: "transition" },
          { target: "acting" },
        ],
      },
    },

    // ═══ TRANSITION ══════════════════════════════════════════════════════════
    transition: {
      entry: emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-green-400 font-semibold">✓ ${context.phase}</div>` })),
      always: [
        { guard: ({ context }) => context.phase === "create", target: "acting", actions: assign({ phase: () => "intent", turn: () => 0, phaseDone: () => false }) },
        { guard: ({ context }) => context.phase === "intent", target: "acting", actions: assign({ phase: () => "requirements", turn: () => 0, phaseDone: () => false }) },
        { guard: ({ context }) => context.phase === "requirements", target: "acting", actions: assign({ phase: () => "solution", turn: () => 0, phaseDone: () => false }) },
        { guard: ({ context }) => context.phase === "solution", target: "acting", actions: assign({ phase: () => "testing", turn: () => 0, phaseDone: () => false }) },
        { guard: ({ context }) => context.phase === "testing", target: "acting", actions: assign({ phase: () => "deployment", turn: () => 0, phaseDone: () => false }) },
        { guard: ({ context }) => context.phase === "deployment", target: "acting", actions: assign({ phase: () => "deployed", turn: () => 0, phaseDone: () => false }) },
        { guard: ({ context }) => context.phase === "deployed", target: "done" },
        { target: "done" },
      ],
    },

    // ═══ DONE ════════════════════════════════════════════════════════════════
    done: { type: "final", entry: [
      emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
      emit(({ context }) => ({ type: "@progress", data: `<div class="text-sm text-green-400 font-bold mt-4">✓ ${context.history.length} actions, ${(context.hintSuggestions || []).length} hints</div>` })),
    ]},

    // ═══ ERROR ═══════════════════════════════════════════════════════════════
    error: {
      entry: [
        emit(({ context }) => ({ type: "@status", data: `<span class="text-red-400">● error</span>` })),
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-red-400">✗ ${context.error}</div>` })),
      ],
      on: {
        retry: { guard: ({ context }) => context.retries < 3, target: "login_navigate", actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }) },
        request: { target: "login_navigate", actions: assign({ prompt: ({ event }) => event.prompt || "", error: () => null, retries: () => 0, turn: () => 0, history: () => [] }) },
      },
    },
  },
});

export default machine;
