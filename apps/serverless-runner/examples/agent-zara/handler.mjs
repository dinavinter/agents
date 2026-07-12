/**
 * Zara — E2E Testing Agent
 *
 * Two long-lived actors:
 *   - pw: Playwright MCP client
 *   - ai: fromAIEventCallback with executable tools (maxSteps for multi-turn)
 *
 * Flow:
 *   Machine sends {type:"snapshot"} to ai → AI calls tools (execute runs on MCP client)
 *   → AI loops internally via maxSteps until __done__ → machine transitions phase
 *
 * The AI actor holds the MCP client reference and tool execute functions call it directly.
 * No event routing needed for tool execution — it's all inside the AI's streamText loop.
 * Machine only sees: tool-call events (for UI progress) + output (phase complete signal)
 */

import { assign, emit, fromCallback, setup, sendTo, spawnChild } from "https://esm.sh/xstate";
import { fromAIEventCallback } from "https://esm.sh/@cxai/stream";
import { z } from "https://esm.sh/zod";
import { tool } from "https://esm.sh/ai";
import { createOpenAI } from "https://esm.sh/@ai-sdk/openai";
import { Client } from "https://esm.sh/@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "https://esm.sh/@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─── AI Model ───────────────────────────────────────────────────────────────
const openai = createOpenAI({
  baseURL: globalThis.process?.env?.OPENAI_BASE_URL || "http://ai-core-proxy.agents.svc.cluster.local:3030/v1",
  apiKey: globalThis.process?.env?.OPENAI_API_KEY || "proxy",
});
const model = openai(globalThis.process?.env?.AI_MODEL || "gpt-4o");

// ─── MCP Client (shared, used by AI tool execute functions) ─────────────────
let mcpClient = null;
let mcpConnected = false;

async function initMCP() {
  const url = globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp";
  mcpClient = new Client({ name: "zara", version: "1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await mcpClient.connect(transport);
  mcpConnected = true;
}

async function callMCP(toolName, args) {
  if (!mcpConnected) throw new Error("MCP not connected");
  const r = await mcpClient.callTool({ name: toolName, arguments: args || {} });
  return r?.content?.map(c => c.text || c.data || "").join("\n") || JSON.stringify(r);
}

// ─── AI Tools (with execute functions that call MCP directly) ────────────────

const aiTools = {
  browser_navigate: tool({
    description: "Navigate to URL",
    parameters: z.object({ url: z.string() }),
    execute: async ({ url }) => callMCP("browser_navigate", { url }),
  }),
  browser_snapshot: tool({
    description: "Page accessibility snapshot — use this to see current page state",
    parameters: z.object({}),
    execute: async () => callMCP("browser_snapshot", {}),
  }),
  browser_click: tool({
    description: "Click element by ref from snapshot",
    parameters: z.object({ target: z.string().describe("Element ref from snapshot e.g. 'e22'") }),
    execute: async ({ target }) => callMCP("browser_click", { target }),
  }),
  browser_type: tool({
    description: "Type text into element",
    parameters: z.object({ target: z.string(), text: z.string(), submit: z.boolean().optional().describe("Press Enter after") }),
    execute: async ({ target, text, submit }) => callMCP("browser_type", { target, text, submit }),
  }),
  browser_run_code_unsafe: tool({
    description: "Run Playwright code directly — use when snapshot refs don't work",
    parameters: z.object({ code: z.string().describe("async (page) => { ... }") }),
    execute: async ({ code }) => callMCP("browser_run_code_unsafe", { code }),
  }),
  browser_wait_for: tool({
    description: "Wait for time or text",
    parameters: z.object({ time: z.number().optional(), text: z.string().optional() }),
    execute: async ({ time, text }) => callMCP("browser_wait_for", { time, text }),
  }),
  browser_press_key: tool({
    description: "Press keyboard key",
    parameters: z.object({ key: z.string() }),
    execute: async ({ key }) => callMCP("browser_press_key", { key }),
  }),
  get_context: tool({
    description: "Get fresh page snapshot + URL (alias for browser_snapshot)",
    parameters: z.object({}),
    execute: async () => callMCP("browser_snapshot", {}),
  }),
  suggest_hint: tool({
    description: "Save a UI hint observation for future runs",
    parameters: z.object({ phase: z.string(), old_hint: z.string(), new_hint: z.string() }),
    execute: async ({ phase, old_hint, new_hint }) => `Hint saved: [${phase}] ${new_hint}`,
  }),
  __done__: tool({
    description: "Signal that the current phase objective is complete",
    parameters: z.object({ reason: z.string().optional() }),
    // No execute — this stops the tool loop
  }),
};

// ─── PW init actor (connects MCP eagerly) ───────────────────────────────────

const pwInitActor = fromCallback(({ sendBack }) => {
  initMCP().then(() => sendBack({ type: "pw.ready" })).catch(e => sendBack({ type: "pw.error", error: e.message }));
  return () => {};
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const PHASES = {
  create: { objective: "Create solution — type prompt in Joule chat, submit", done: "URL contains /solutions/<uuid>" },
  intent: { objective: "Answer Joule's clarifying questions", done: "Stepper advances past Intent" },
  requirements: { objective: "Wait for requirements", done: "Stepper advances past Requirements" },
  solution: { objective: "Wait for code gen", done: "Try/Test/Deploy visible" },
  testing: { objective: "Test in sandbox", done: "Deploy enabled" },
  deployment: { objective: "Deploy", done: "Status Running/Deployed" },
  deployed: { objective: "Verify deployed solution", done: "Agent responds" },
};

// ─── Machine ────────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    pwInitActor,
    aiActor: fromAIEventCallback({
      model,
      tools: aiTools,
      maxSteps: 20,
      system: `You are Zara, browser automation agent for Joule Studio.
You have browser tools that execute immediately and return results.
Use browser_snapshot or get_context to see the page before acting.
Use browser_run_code_unsafe when snapshot refs don't work (shadow DOM, custom elements).
Call __done__ when the phase objective is met.

IMPORTANT:
- Always snapshot first if you don't know page state
- Use element refs from snapshot (e.g. target: "e22")  
- URL is the most reliable completion signal
- Chat input may be in shadow DOM — use browser_run_code_unsafe
- Wait 3-5s after page-changing actions before snapshotting`,
    }),
  },
  types: { input: {}, context: {}, emitted: {} },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    solutionId: input?.solutionId || null,
    solutionUrl: input?.solutionUrl || null,
    prompt: input?.prompt || "",
    projectId: input?.projectId || "",
    phase: "create",
    lastSnapshot: "", timeline: "",
    error: null, retries: 0, turn: 0,
    hints: "", phaseDone: false,
    ...input,
  }),

  entry: [
    emit({ type: "message", data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100"><header class="sticky top-0 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4"><span class="text-lg font-semibold text-purple-400">Zara</span><span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span></header><div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div><form class="mt-4 flex gap-2"><input type="text" name="prompt" placeholder="What to test..." class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg"/><button type="submit" hx-post="events/request" class="px-6 py-3 bg-purple-600 rounded-lg">Start</button></form></main>` }),
    spawnChild("pwInitActor", { id: "pwInit" }),
    spawnChild("aiActor", { id: "ai", systemId: "ai", input: { type: "phase", template: "PHASE: {{phase}}\nOBJECTIVE: {{objective}}\nDONE WHEN: {{doneWhen}}\nTASK: {{prompt}}\nSOLUTION: {{solutionId}}\n{{#hints}}HINTS:\n{{hints}}{{/hints}}" } }),
  ],

  on: {
    "pw.ready": { actions: emit({ type: "@progress", data: `<div class="text-xs text-green-400">✓ MCP connected</div>` }) },
    "pw.error": { actions: assign({ error: ({ event }) => `MCP: ${event.error}` }) },
    // AI emits tool-call events — show progress
    "tool-call": { actions: emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${event.toolName}(${JSON.stringify(event.args || {}).substring(0, 60)})</div>` })) },
    "tool-result": { actions: [
      emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-gray-500">← [${event.toolName}] ${(typeof event.result === "string" ? event.result : JSON.stringify(event.result) || "").substring(0, 80)}</div>` })),
      assign({
        turn: ({ context }) => context.turn + 1,
        lastSnapshot: ({ context, event }) => {
          const text = typeof event.result === "string" ? event.result : "";
          return text.includes("Page URL:") ? text : context.lastSnapshot;
        },
        solutionId: ({ context, event }) => {
          if (context.solutionId) return context.solutionId;
          const text = typeof event.result === "string" ? event.result : "";
          const m = text.match(/\/solutions\/([0-9a-f-]{36})/);
          return m ? m[1] : context.solutionId;
        },
      }),
    ]},
    // AI output = stream finished (after __done__ or maxSteps)
    "output": { actions: assign({ phaseDone: () => true }) },
    // AI finish = tool loop ended
    "finish": { actions: assign({ phaseDone: () => true }) },
  },

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: { request: { target: "login", actions: assign({
        prompt: ({ event }) => event.prompt || "", projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
        solutionId: ({ event }) => event.solutionId || null,
        error: () => null, retries: () => 0, turn: () => 0,
        phase: () => "create", hints: () => "", phaseDone: () => false,
      })}},
    },

    // ═══ LOGIN ═══════════════════════════════════════════════════════════════
    login: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● login</span>` }),
        // Kick off login by sending to AI
        sendTo("ai", ({ context }) => ({
          type: "phase",
          phase: "login",
          objective: "Navigate to Joule Studio and login with IAS credentials",
          doneWhen: "Page shows Conversations/Spaces/Develop nav",
          prompt: `Login to ${globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com"}/new/build with username ${globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com"} and password ${globalThis.process?.env?.IAS_PASSWORD || "openCODE1!"}. Use browser_run_code_unsafe to fill the form.`,
          solutionId: context.solutionId,
          hints: "",
        })),
      ],
      on: {
        "output": [
          { guard: ({ context }) => !!context.solutionId, target: "building", actions: assign({ phaseDone: () => false }) },
          { target: "create", actions: assign({ phaseDone: () => false }) },
        ],
      },
    },

    // ═══ CREATE ══════════════════════════════════════════════════════════════
    create: {
      entry: [
        assign({ phase: () => "create", phaseDone: () => false }),
        emit({ type: "@status", data: `<span class="text-blue-400">● create</span>` }),
        sendTo("ai", ({ context }) => ({
          type: "phase",
          phase: "create",
          objective: PHASES.create.objective,
          doneWhen: PHASES.create.done,
          prompt: context.prompt,
          solutionId: context.solutionId,
          hints: context.hints + "\nChat input may be shadow DOM. Use browser_run_code_unsafe: async (page) => { await page.locator('[placeholder*=\"Message\"], textarea, [contenteditable]').first().fill('TEXT'); await page.keyboard.press('Enter'); }",
        })),
      ],
      on: { "output": [
        { guard: ({ context }) => !!context.solutionId, target: "building", actions: assign({ phaseDone: () => false }) },
        { target: "create" }, // loop if no solution yet
      ]},
    },

    // ═══ BUILDING ════════════════════════════════════════════════════════════
    building: {
      initial: "intent",
      entry: emit({ type: "@status", data: `<span class="text-purple-400">● building</span>` }),
      states: {
        intent: {
          entry: [
            assign({ phase: () => "intent", phaseDone: () => false }),
            emit({ type: "@status", data: `<span class="text-indigo-400">● intent</span>` }),
            sendTo("ai", ({ context }) => ({ type: "phase", phase: "intent", objective: PHASES.intent.objective, doneWhen: PHASES.intent.done, prompt: context.prompt, solutionId: context.solutionId, hints: context.hints })),
          ],
          on: { "output": { target: "requirements", actions: assign({ phaseDone: () => false }) } },
        },
        requirements: {
          entry: [
            assign({ phase: () => "requirements", phaseDone: () => false }),
            emit({ type: "@status", data: `<span class="text-indigo-400">● requirements</span>` }),
            sendTo("ai", ({ context }) => ({ type: "phase", phase: "requirements", objective: PHASES.requirements.objective, doneWhen: PHASES.requirements.done, prompt: context.prompt, solutionId: context.solutionId, hints: context.hints })),
          ],
          on: { "output": { target: "solution", actions: assign({ phaseDone: () => false }) } },
        },
        solution: {
          entry: [
            assign({ phase: () => "solution", phaseDone: () => false }),
            emit({ type: "@status", data: `<span class="text-indigo-400">● solution</span>` }),
            sendTo("ai", ({ context }) => ({ type: "phase", phase: "solution", objective: PHASES.solution.objective, doneWhen: PHASES.solution.done, prompt: context.prompt, solutionId: context.solutionId, hints: context.hints })),
          ],
          on: { "output": { target: "testing", actions: assign({ phaseDone: () => false }) } },
        },
        testing: {
          entry: [
            assign({ phase: () => "testing", phaseDone: () => false }),
            emit({ type: "@status", data: `<span class="text-orange-400">● testing</span>` }),
            sendTo("ai", ({ context }) => ({ type: "phase", phase: "testing", objective: PHASES.testing.objective, doneWhen: PHASES.testing.done, prompt: context.prompt, solutionId: context.solutionId, hints: context.hints })),
          ],
          on: { "output": { target: "deployment", actions: assign({ phaseDone: () => false }) } },
        },
        deployment: {
          entry: [
            assign({ phase: () => "deployment", phaseDone: () => false }),
            emit({ type: "@status", data: `<span class="text-orange-400">● deployment</span>` }),
            sendTo("ai", ({ context }) => ({ type: "phase", phase: "deployment", objective: PHASES.deployment.objective, doneWhen: PHASES.deployment.done, prompt: context.prompt, solutionId: context.solutionId, hints: context.hints })),
          ],
          on: { "output": { target: "deployed", actions: assign({ phaseDone: () => false }) } },
        },
        deployed: {
          entry: [
            assign({ phase: () => "deployed", phaseDone: () => false }),
            emit({ type: "@status", data: `<span class="text-cyan-400">● deployed</span>` }),
            sendTo("ai", ({ context }) => ({ type: "phase", phase: "deployed", objective: PHASES.deployed.objective, doneWhen: PHASES.deployed.done, prompt: context.prompt, solutionId: context.solutionId, hints: context.hints })),
          ],
          on: { "output": { target: "complete", actions: assign({ phaseDone: () => false }) } },
        },
        complete: { type: "final" },
      },
      onDone: "done",
    },

    // ═══ DONE ════════════════════════════════════════════════════════════════
    done: { type: "final", entry: [
      emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
      emit(({ context }) => ({ type: "@progress", data: `<div class="text-sm text-green-400 font-bold mt-4">✓ Solution ${context.solutionId || "?"} — ${context.turn} tool calls</div>` })),
    ]},

    // ═══ ERROR ═══════════════════════════════════════════════════════════════
    error: {
      entry: [
        emit(({ context }) => ({ type: "@status", data: `<span class="text-red-400">● error</span>` })),
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-red-400">✗ ${context.error}</div>` })),
      ],
      on: { retry: { target: "login", actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }) } },
    },
  },
});

export default machine;
