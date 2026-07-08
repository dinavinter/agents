/**
 * Zara — E2E Testing Agent
 *
 * States: idle → login → create | building (sub-machine)
 *   - If no solutionId: go to "create" — AI creates solution, posts solution.created
 *   - If solutionId exists: go to "building" directly (restore/resume)
 *   - "building" is a sub-machine: intent → requirements → solution → testing → deployment → deployed
 *   - building entry verifies we're on the solution page
 */

import { assign, emit, fromCallback, setup, sendTo, spawnChild } from "https://esm.sh/xstate";
import { fromAIElementStream } from "https://esm.sh/@cxai/stream";
import { z } from "https://esm.sh/zod";
import { Client } from "https://esm.sh/@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "https://esm.sh/@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─── Playwright MCP actor ───────────────────────────────────────────────────

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
    if (event.type !== "call") return;
    const { tool, args } = event;
    if (tool === "suggest_hint") { sendBack({ type: "pw.result", tool, args, result: `Hint: [${args?.phase}] ${args?.new_hint}` }); return; }
    if (tool === "__done__") { sendBack({ type: "pw.result", tool, args, result: "done" }); return; }
    if (tool === "get_context") {
      if (!connected) { sendBack({ type: "pw.result", tool, error: "Not connected" }); return; }
      try { const r = await client.callTool({ name: "browser_snapshot", arguments: {} }); sendBack({ type: "pw.result", tool, args: {}, result: r?.content?.map(c => c.text || "").join("\n") || "" }); }
      catch (e) { sendBack({ type: "pw.result", tool, error: e.message }); }
      return;
    }
    if (!connected) { sendBack({ type: "pw.result", tool, error: "Not connected" }); return; }
    try {
      const r = await client.callTool({ name: tool, arguments: args || {} });
      sendBack({ type: "pw.result", tool, args, result: r?.content?.map(c => c.text || c.data || "").join("\n") || JSON.stringify(r) });
    } catch (e) { sendBack({ type: "pw.result", tool, args, error: e.message }); }
  });

  return () => { if (connected) client.close().catch(() => {}); };
});

// ─── Schema ─────────────────────────────────────────────────────────────────

const toolCallSchema = z.object({
  tool: z.string().describe("Tool: browser_navigate, browser_snapshot, browser_click, browser_type, browser_run_code_unsafe, browser_wait_for, get_context, suggest_hint, __done__"),
  args: z.record(z.any()).describe("Arguments"),
  reasoning: z.string().optional().describe("Why"),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  return tools.map(t => `- ${t.name}: ${t.description || ""}`).join("\n")
    + "\n- get_context: Fresh snapshot"
    + "\n- suggest_hint: Save hint. Args: {phase, old_hint, new_hint}"
    + "\n- __done__: Phase complete";
}

function formatTimeline(history) {
  return history.slice(-8).map(h => {
    const t = new Date(h.ts).toISOString().slice(11, 19);
    const s = h.error ? `ERR: ${h.error.substring(0, 80)}` : (h.result || "ok").substring(0, 100);
    return `[${t}][${h.phase}] ${h.tool}(${JSON.stringify(h.args || {}).substring(0, 40)}) → ${s}`;
  }).join("\n");
}

const PHASES = {
  create: { objective: "Create a new solution — type prompt in Joule chat, submit", done: "URL contains /solutions/<uuid>", hints: "Chat may be shadow DOM. Use browser_run_code_unsafe: async (page) => { await page.locator('[placeholder*=\"Message\"], textarea, [contenteditable]').first().fill('TEXT'); await page.keyboard.press('Enter'); }" },
  intent: { objective: "Answer Joule's clarifying questions", done: "Stepper advances past Intent", hints: "Answer in chat. Look for stepper." },
  requirements: { objective: "Wait for requirements generation", done: "Stepper advances past Requirements", hints: "Poll with get_context every 15-30s." },
  solution: { objective: "Wait for code generation", done: "Try/Test/Deploy button visible", hints: "Poll with get_context. Takes 60-180s." },
  testing: { objective: "Test in sandbox", done: "Deploy button enabled", hints: "Click Try, send test, verify." },
  deployment: { objective: "Deploy", done: "Status = Running/Deployed", hints: "Click Deploy. Poll. Takes 60-300s." },
  deployed: { objective: "Verify deployed solution", done: "Agent responds", hints: "@mention agent in Conversations." },
};

function phaseInput(context, phase) {
  const p = PHASES[phase];
  return {
    schema: toolCallSchema,
    system: `You are Zara, browser automation agent for Joule Studio.
Emit tool calls as structured objects — each executes immediately.

RULES:
1. get_context to see page state
2. "target" with refs from snapshot (ref=e22 → target:"e22")
3. URL is most reliable signal
4. Errors repeat → browser_run_code_unsafe
5. __done__ when objective met
6. get_context between actions to see changes

SOLUTION: ${context.solutionId || "pending"}
PHASE: ${phase}
OBJECTIVE: ${p.objective}
DONE WHEN: ${p.done}
HINTS: ${p.hints}
${context.hints ? `LEARNED:\n${context.hints}` : ""}

TOOLS:\n${context.toolCatalog}`,
    template: `Task: ${context.prompt}
Solution: ${context.solutionId || "creating..."}
${context.solutionUrl ? `URL: ${context.solutionUrl}` : ""}

${context.lastSnapshot ? `Page:\n${context.lastSnapshot.substring(0, 3000)}` : "No page — emit get_context."}

${context.history.length ? `Timeline:\n${formatTimeline(context.history)}` : ""}`,
  };
}

function phaseEvents() {
  return {
    "*": {
      guard: ({ event }) => !!event.tool && event.type !== "output",
      actions: [
        emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${event.tool}(${JSON.stringify(event.args || {}).substring(0, 50)})</div>` })),
        sendTo("pw", ({ event }) => ({ type: "call", tool: event.tool, args: event.args || {} })),
      ],
    },
  };
}

// ─── Machine ────────────────────────────────────────────────────────────────

export const machine = setup({
  actors: { playwrightActor, aiStream: fromAIElementStream() },
  types: { input: {}, context: {}, emitted: {} },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    solutionId: input?.solutionId || null,
    solutionUrl: input?.solutionUrl || null,
    prompt: input?.prompt || "",
    projectId: input?.projectId || "",
    tools: [], toolCatalog: "",
    lastSnapshot: "", history: [],
    error: null, retries: 0, turn: 0, maxTurns: 50,
    hints: "", hintSuggestions: [], phaseDone: false,
    ...input,
  }),

  entry: [
    emit({ type: "message", data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100"><header class="sticky top-0 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4"><span class="text-lg font-semibold text-purple-400">Zara</span><span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span></header><div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div><form class="mt-4 flex gap-2"><input type="text" name="prompt" placeholder="What to test..." class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg"/><button type="submit" hx-post="events/request" class="px-6 py-3 bg-purple-600 rounded-lg">Start</button></form></main>` }),
    spawnChild("playwrightActor", { id: "pw", systemId: "pw", input: { url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp" } }),
  ],

  // Global event handlers
  on: {
    "pw.ready": { actions: [
      assign({ tools: ({ event }) => event.tools, toolCatalog: ({ event }) => buildToolCatalog(event.tools) }),
      emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-green-400">✓ PW: ${event.tools.length} tools</div>` })),
    ]},
    "pw.error": { target: ".error", actions: assign({ error: ({ event }) => `PW: ${event.error}` }) },
    "pw.result": { actions: [
      assign({
        history: ({ context, event }) => [...context.history, { tool: event.tool, args: event.args, result: event.result, error: event.error, ts: Date.now(), phase: "active", turn: context.turn }],
        lastSnapshot: ({ context, event }) => (event.tool === "browser_snapshot" || event.tool === "get_context") ? (event.result || context.lastSnapshot) : context.lastSnapshot,
        phaseDone: ({ context, event }) => event.tool === "__done__" ? true : context.phaseDone,
        hints: ({ context, event }) => event.tool === "suggest_hint" ? (context.hints || "") + `\n[${event.args?.phase}] ${event.args?.new_hint || ""}` : context.hints,
        hintSuggestions: ({ context, event }) => event.tool === "suggest_hint" ? [...(context.hintSuggestions || []), event.args] : context.hintSuggestions,
        solutionId: ({ context, event }) => { if (context.solutionId) return context.solutionId; const m = (event.result || "").match(/\/solutions\/([0-9a-f-]{36})/); return m ? m[1] : context.solutionId; },
        solutionUrl: ({ context, event }) => { if (context.solutionUrl) return context.solutionUrl; const m = (event.result || "").match(/(https?:\/\/[^\s]*\/solutions\/[0-9a-f-]{36}[^\s]*)/); return m ? m[1] : context.solutionUrl; },
      }),
      emit(({ event }) => ({ type: "@progress", data: event.tool === "suggest_hint" ? `<div class="text-xs text-amber-400">💡 ${event.args?.new_hint || ""}</div>` : event.tool === "__done__" ? `<div class="text-xs text-green-400 font-semibold">✓ Done</div>` : `<div class="text-xs text-gray-500">← [${event.tool}] ${(event.error || event.result || "").substring(0, 80)}</div>` })),
    ]},
    // solution.created event — can be posted externally or by AI detecting URL change
    "solution.created": { actions: assign({ solutionId: ({ event }) => event.solutionId, solutionUrl: ({ event }) => event.solutionUrl }) },
  },

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: { request: { target: "login", actions: assign({
        prompt: ({ event }) => event.prompt || "", projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
        solutionId: ({ event }) => event.solutionId || null, solutionUrl: ({ event }) => event.solutionUrl || null,
        error: () => null, retries: () => 0, turn: () => 0, history: () => [],
        hints: () => "", hintSuggestions: () => [], phaseDone: () => false,
      })}},
    },

    // ═══ LOGIN ═══════════════════════════════════════════════════════════════
    login: {
      initial: "navigate",
      entry: emit({ type: "@status", data: `<span class="text-blue-400">● login</span>` }),
      states: {
        navigate: { entry: sendTo("pw", () => ({ type: "call", tool: "browser_navigate", args: { url: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build" } })), on: { "pw.result": "wait" } },
        wait: { entry: sendTo("pw", { type: "call", tool: "browser_wait_for", args: { time: 3 } }), on: { "pw.result": "fill" } },
        fill: {
          entry: [
            emit({ type: "@progress", data: `<div class="text-xs text-blue-300">Logging in...</div>` }),
            sendTo("pw", () => ({ type: "call", tool: "browser_run_code_unsafe", args: { code: `async (page) => { const u = '${globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com"}'; const p = '${globalThis.process?.env?.IAS_PASSWORD || "openCODE1!"}'; try { const e = page.locator('input[type="email"], input[type="text"], input[name*="user"]').first(); await e.fill(u); const b = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first(); await b.click(); await page.waitForTimeout(2000); const pw = page.locator('input[type="password"]').first(); await pw.fill(p); const s = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first(); await s.click(); await page.waitForTimeout(5000); } catch(err) {} return page.url(); }` } })),
          ],
          on: { "pw.result": "snapshot" },
        },
        snapshot: { entry: sendTo("pw", { type: "call", tool: "browser_snapshot", args: {} }), on: { "pw.result": { target: "done", actions: assign({ lastSnapshot: ({ event }) => event.result || "" }) } } },
        done: { type: "final" },
      },
      onDone: [
        // If we have a solutionId → go to building (resume)
        { guard: ({ context }) => !!context.solutionId, target: "building" },
        // Otherwise → create new solution
        { target: "create" },
      ],
    },

    // ═══ CREATE: AI creates a new solution in Joule ══════════════════════════
    create: {
      entry: [
        assign({ phaseDone: () => false }),
        emit({ type: "@status", data: `<span class="text-blue-400">● create</span>` }),
      ],
      invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "create") },
      on: {
        ...phaseEvents(),
        output: [
          // AI done + solutionId detected → transition to building
          { guard: ({ context }) => !!context.solutionId, target: "building", actions: emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-green-400 font-semibold">✓ Solution created: ${context.solutionId}</div>` })) },
          // AI done but no solutionId yet — loop (maybe URL hasn't updated)
          { guard: ({ context }) => context.phaseDone, target: "building" },
          // Not done — loop create
          { target: "create" },
        ],
      },
    },

    // ═══ BUILDING: sub-machine (intent → requirements → solution → ...) ═════
    // Entry action verifies we're on the solution page
    building: {
      initial: "verify",
      entry: emit({ type: "@status", data: `<span class="text-purple-400">● building</span>` }),
      states: {
        // Verify we're on the solution page before proceeding
        verify: {
          entry: sendTo("pw", { type: "call", tool: "get_context", args: {} }),
          on: {
            "pw.result": [
              // Already on solution page → detect phase
              { guard: ({ context, event }) => (event.result || "").includes("/solutions/") || (context.lastSnapshot || "").includes("/solutions/"), target: "detect" },
              // Not on solution page — navigate there
              { target: "navigate_solution" },
            ],
          },
        },
        navigate_solution: {
          entry: sendTo("pw", ({ context }) => ({
            type: "call", tool: "browser_navigate",
            args: { url: context.solutionUrl || `${globalThis.process?.env?.DAS_HOST || ""}/new/build/solutions/${context.solutionId}` },
          })),
          on: { "pw.result": "wait_nav" },
        },
        wait_nav: {
          entry: sendTo("pw", { type: "call", tool: "browser_wait_for", args: { time: 3 } }),
          on: { "pw.result": "detect" },
        },

        // Detect current phase from page state
        detect: {
          entry: sendTo("pw", { type: "call", tool: "get_context", args: {} }),
          on: { "pw.result": { target: "intent", actions: assign({ lastSnapshot: ({ event }) => event.result || "" }) } },
          // TODO: smarter phase detection based on snapshot content
        },

        // ─── Phase states ────────────────────────────────────────────────
        intent: {
          entry: [assign({ phaseDone: () => false, turn: ({ context }) => context.turn + 1 }), emit({ type: "@status", data: `<span class="text-indigo-400">● intent</span>` })],
          invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "intent") },
          on: { ...phaseEvents(), output: [{ guard: ({ context }) => context.phaseDone, target: "requirements" }, { target: "intent" }] },
        },
        requirements: {
          entry: [assign({ phaseDone: () => false, turn: ({ context }) => context.turn + 1 }), emit({ type: "@status", data: `<span class="text-indigo-400">● requirements</span>` })],
          invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "requirements") },
          on: { ...phaseEvents(), output: [{ guard: ({ context }) => context.phaseDone, target: "solution" }, { target: "requirements" }] },
        },
        solution: {
          entry: [assign({ phaseDone: () => false, turn: ({ context }) => context.turn + 1 }), emit({ type: "@status", data: `<span class="text-indigo-400">● solution</span>` })],
          invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "solution") },
          on: { ...phaseEvents(), output: [{ guard: ({ context }) => context.phaseDone, target: "testing" }, { target: "solution" }] },
        },
        testing: {
          entry: [assign({ phaseDone: () => false, turn: ({ context }) => context.turn + 1 }), emit({ type: "@status", data: `<span class="text-orange-400">● testing</span>` })],
          invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "testing") },
          on: { ...phaseEvents(), output: [{ guard: ({ context }) => context.phaseDone, target: "deployment" }, { target: "testing" }] },
        },
        deployment: {
          entry: [assign({ phaseDone: () => false, turn: ({ context }) => context.turn + 1 }), emit({ type: "@status", data: `<span class="text-orange-400">● deployment</span>` })],
          invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "deployment") },
          on: { ...phaseEvents(), output: [{ guard: ({ context }) => context.phaseDone, target: "deployed" }, { target: "deployment" }] },
        },
        deployed: {
          entry: [assign({ phaseDone: () => false, turn: ({ context }) => context.turn + 1 }), emit({ type: "@status", data: `<span class="text-cyan-400">● deployed</span>` })],
          invoke: { src: "aiStream", input: ({ context }) => phaseInput(context, "deployed") },
          on: { ...phaseEvents(), output: [{ guard: ({ context }) => context.phaseDone, target: "complete" }, { target: "deployed" }] },
        },
        complete: { type: "final" },
      },
      onDone: "done",
    },

    // ═══ DONE ════════════════════════════════════════════════════════════════
    done: { type: "final", entry: [
      emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
      emit(({ context }) => ({ type: "@progress", data: `<div class="text-sm text-green-400 font-bold mt-4">✓ Solution ${context.solutionId || "?"} — ${context.history.length} actions</div>` })),
    ]},

    // ═══ ERROR ═══════════════════════════════════════════════════════════════
    error: {
      entry: [
        emit(({ context }) => ({ type: "@status", data: `<span class="text-red-400">● error</span>` })),
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-red-400">✗ ${context.error}</div>` })),
      ],
      on: {
        retry: { guard: ({ context }) => context.retries < 3, target: "login", actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }) },
        request: { target: "login", actions: assign({ prompt: ({ event }) => event.prompt || "", error: () => null, retries: () => 0, turn: () => 0, history: () => [] }) },
      },
    },
  },
});

export default machine;
