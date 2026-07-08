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
  tool: z.string().describe("The tool name to call (browser_navigate, browser_snapshot, browser_click, browser_type, browser_run_code_unsafe, browser_wait_for, suggest_hint, __done__)"),
  args: z.record(z.any()).describe("Arguments for the tool"),
  reasoning: z.string().optional().describe("Brief reasoning for this action"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  const pw = tools.map(t => `- ${t.name}: ${t.description || ""}`).join("\n");
  return `${pw}\n- suggest_hint: Save a UI hint for future runs. Args: {phase, old_hint, new_hint}\n- __done__: Phase complete. Args: {}`;
}

function buildSystemPrompt(ctx) {
  return `You are Zara, a browser automation agent testing Joule Studio.

You emit a SEQUENCE of tool calls as structured objects. Each object you emit will be executed on the browser immediately.

RULES:
1. ALWAYS start with browser_snapshot if you don't know page state
2. Use "target" with refs from snapshot (ref=e22 → target:"e22")
3. URL is the most reliable signal for phase completion
4. If same error 3+ times, try browser_run_code_unsafe as fallback
5. Emit __done__ as your LAST action when the phase objective is met
6. If a hint is wrong, emit suggest_hint then continue with next action

PHASE: ${ctx.phase}

OBJECTIVES:
- create: Type prompt in chat, submit. DONE when URL has /solutions/<uuid>
- intent: Answer Joule questions. DONE when stepper advances past Intent
- requirements: Wait/answer. DONE when stepper advances past Requirements
- solution: Wait for code gen. DONE when Try/Test/Deploy button visible
- testing: Test in sandbox. DONE when Deploy enabled
- deployment: Click Deploy, wait. DONE when status=Running/Deployed
- deployed: Verify via Conversations. DONE when agent responds

HINTS:
- Chat input may be in shadow DOM — use browser_run_code_unsafe if snapshot shows empty main
- Example: {"tool":"browser_run_code_unsafe","args":{"code":"async (page) => { await page.locator('[placeholder*=\"Message\"], textarea, [contenteditable]').first().fill('text'); await page.keyboard.press('Enter'); }"}}
- Wait 3-5s after actions that trigger page changes
- If URL has /solutions/ at start of create phase → already done, emit __done__

${ctx.hints ? `LEARNED:\n${ctx.hints}` : ""}

TOOLS:\n${ctx.toolCatalog}`;
}

function buildUserPrompt(ctx) {
  const parts = [`Phase: ${ctx.phase} | Turn: ${ctx.turn}/${ctx.maxTurns}`];
  if (ctx.prompt) parts.push(`Task: ${ctx.prompt}`);
  if (ctx.lastSnapshot) {
    const urlMatch = ctx.lastSnapshot.match(/Page URL: ([^\n]+)/);
    if (urlMatch) parts.push(`URL: ${urlMatch[1]}`);
    parts.push(`Snapshot:\n${ctx.lastSnapshot.substring(0, 3000)}`);
  }
  if (ctx.history.length) {
    parts.push(`Last actions:\n${ctx.history.slice(-5).map(h => `[${h.tool}] ${(h.error || h.result || "ok").substring(0, 120)}`).join("\n")}`);
  } else {
    parts.push("No actions yet — emit browser_snapshot first.");
  }
  return parts.join("\n\n");
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
    // pw.result arrives while AI stream is running — accumulate in history
    "pw.result": { actions: [
      assign({
        history: ({ context, event }) => [...context.history, { tool: event.tool, result: event.result, error: event.error }],
        lastSnapshot: ({ context, event }) => event.tool === "browser_snapshot" ? (event.result || context.lastSnapshot) : context.lastSnapshot,
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
          system: buildSystemPrompt(context),
          template: buildUserPrompt(context),
        }),
      },
      on: {
        // Each streamed element is a tool call — forward to pw actor
        "*": {
          guard: ({ event }) => !!event.tool && event.type !== "output",
          actions: [
            emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${event.tool}(${JSON.stringify(event.args || {}).substring(0, 60)})</div>` })),
            sendTo("pw", ({ event }) => ({ type: "call", tool: event.tool, args: event.args || {} })),
          ],
        },
        // Stream complete — check if phase done, then loop or transition
        output: [
          { guard: ({ context }) => context.phaseDone, target: "transition" },
          { target: "acting" },  // loop: re-invoke AI with updated context (history has pw.results)
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
