/**
 * Zara — E2E Testing Agent
 *
 * Two long-lived actors spawned at machine entry:
 *   - pw: Playwright MCP client — executes browser tools
 *   - ai: fromAIEventCallback — receives pw.result events, streams tool calls back
 *
 * Machine routes events between them:
 *   pw.result → forward to ai actor
 *   ai streamed parts (tool calls) → forward to pw actor
 *   ai "output" → check for phase transitions
 *
 * States: idle → login → create → building (intent → requirements → ...)
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
    if (tool === "suggest_hint") { sendBack({ type: "pw.result", tool, args, result: `Hint saved: [${args?.phase}] ${args?.new_hint}` }); return; }
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  return tools.map(t => `- ${t.name}: ${t.description || ""}`).join("\n")
    + "\n- get_context: Fresh page snapshot"
    + "\n- suggest_hint: Save hint for future. Args: {phase, old_hint, new_hint}"
    + "\n- __done__: Current phase complete";
}

/** Convert MCP tool definitions to Vercel AI SDK tool() format */
function buildAITools(mcpTools) {
  const aiTools = {};
  for (const t of mcpTools) {
    // Convert JSON Schema properties to Zod (simplified — use z.record for complex args)
    aiTools[t.name] = tool({
      description: t.description || t.name,
      parameters: z.object({
        ...(t.inputSchema?.required?.includes("url") ? { url: z.string().describe("URL to navigate to") } : {}),
        ...(t.inputSchema?.required?.includes("target") ? { target: z.string().describe("Element ref from snapshot") } : {}),
        ...(t.inputSchema?.required?.includes("text") ? { text: z.string().describe("Text to type") } : {}),
        ...(t.inputSchema?.properties?.code ? { code: z.string().describe("Playwright code to run") } : {}),
        ...(t.inputSchema?.properties?.time ? { time: z.number().optional().describe("Seconds to wait") } : {}),
        ...(t.inputSchema?.properties?.text && !t.inputSchema?.required?.includes("text") ? { text: z.string().optional().describe("Text to wait for") } : {}),
        ...(t.inputSchema?.properties?.submit ? { submit: z.boolean().optional().describe("Press Enter after") } : {}),
      }),
    });
  }
  // Virtual tools
  aiTools["get_context"] = tool({ description: "Get fresh page snapshot", parameters: z.object({}) });
  aiTools["suggest_hint"] = tool({ description: "Save UI hint for future runs", parameters: z.object({ phase: z.string(), old_hint: z.string(), new_hint: z.string() }) });
  aiTools["__done__"] = tool({ description: "Signal current phase is complete", parameters: z.object({}) });
  return aiTools;
}

const PHASES = {
  create: { objective: "Create solution — type prompt in Joule chat, submit", done: "URL contains /solutions/<uuid>" },
  intent: { objective: "Answer Joule's clarifying questions", done: "Stepper advances past Intent" },
  requirements: { objective: "Wait for requirements", done: "Stepper advances past Requirements" },
  solution: { objective: "Wait for code gen", done: "Try/Test/Deploy visible" },
  testing: { objective: "Test in sandbox", done: "Deploy enabled" },
  deployment: { objective: "Deploy", done: "Status Running/Deployed" },
  deployed: { objective: "Verify deployed solution", done: "Agent responds" },
};

const PHASE_ORDER = ["create", "intent", "requirements", "solution", "testing", "deployment", "deployed", "done"];

function nextPhase(current) {
  const idx = PHASE_ORDER.indexOf(current);
  return idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : "done";
}

// ─── Static AI tools (defined at setup time for fromAIEventCallback) ─────────
const staticAITools = {
  browser_navigate: tool({ description: "Navigate to URL", parameters: z.object({ url: z.string() }) }),
  browser_snapshot: tool({ description: "Page accessibility snapshot", parameters: z.object({}) }),
  browser_click: tool({ description: "Click element", parameters: z.object({ target: z.string().describe("Element ref from snapshot") }) }),
  browser_type: tool({ description: "Type text", parameters: z.object({ target: z.string(), text: z.string(), submit: z.boolean().optional() }) }),
  browser_run_code_unsafe: tool({ description: "Run Playwright code", parameters: z.object({ code: z.string() }) }),
  browser_wait_for: tool({ description: "Wait", parameters: z.object({ time: z.number().optional(), text: z.string().optional() }) }),
  browser_press_key: tool({ description: "Press key", parameters: z.object({ key: z.string() }) }),
  browser_fill_form: tool({ description: "Fill form fields", parameters: z.object({ fields: z.array(z.object({ target: z.string(), name: z.string(), type: z.string(), value: z.string() })) }) }),
  get_context: tool({ description: "Fresh page snapshot", parameters: z.object({}) }),
  suggest_hint: tool({ description: "Save UI hint for future runs", parameters: z.object({ phase: z.string(), old_hint: z.string(), new_hint: z.string() }) }),
  __done__: tool({ description: "Current phase complete", parameters: z.object({}) }),
};

// ─── Machine ────────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    playwrightActor,
    aiActor: fromAIEventCallback({
      model,
      tools: staticAITools,
      system: `You are Zara, browser automation agent for Joule Studio.
Use tools to interact with the browser. Each tool call executes immediately.
Call __done__ when the current phase objective is met.
Call get_context to see the current page state.
Call suggest_hint if a UI hint is outdated.`,
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
    tools: [], toolCatalog: "", aiTools: {},
    lastSnapshot: "", history: [], timeline: "",
    error: null, retries: 0, turn: 0, maxTurns: 100,
    hints: "", hintSuggestions: [], phaseDone: false,
    ...input,
  }),

  entry: [
    emit({ type: "message", data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100"><header class="sticky top-0 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4"><span class="text-lg font-semibold text-purple-400">Zara</span><span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span></header><div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div><form class="mt-4 flex gap-2"><input type="text" name="prompt" placeholder="What to test..." class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg"/><button type="submit" hx-post="events/request" class="px-6 py-3 bg-purple-600 rounded-lg">Start</button></form></main>` }),
    spawnChild("playwrightActor", { id: "pw", systemId: "pw", input: { url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp" } }),
    spawnChild("aiActor", { id: "ai", systemId: "ai", input: { type: "snapshot", template: "Phase: {{phase}}\nTask: {{prompt}}\nSolution: {{solutionId}}\n{{#lastSnapshot}}Page:\n{{lastSnapshot}}{{/lastSnapshot}}\n{{#timeline}}Timeline:\n{{timeline}}{{/timeline}}" } }),
  ],

  // ─── Global event routing ─────────────────────────────────────────────────
  on: {
    // PW ready — store tools
    "pw.ready": { actions: [
      assign({
        tools: ({ event }) => event.tools,
        toolCatalog: ({ event }) => buildToolCatalog(event.tools),
        aiTools: ({ event }) => buildAITools(event.tools),
      }),
      emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-green-400">✓ PW: ${event.tools.length} tools</div>` })),
    ]},
    "pw.error": { actions: assign({ error: ({ event }) => `PW: ${event.error}` }) },

    // PW result → update context + forward to AI actor
    "pw.result": { actions: [
      assign({
        history: ({ context, event }) => [...context.history, { tool: event.tool, args: event.args, result: event.result, error: event.error, ts: Date.now(), phase: context.phase, turn: context.turn }],
        timeline: ({ context, event }) => {
          const t = new Date().toISOString().slice(11, 19);
          const s = event.error ? `ERR: ${event.error.substring(0, 60)}` : (event.result || "ok").substring(0, 80);
          return (context.timeline || "").split("\n").filter(Boolean).slice(-7).concat(`[${t}] ${event.tool} → ${s}`).join("\n");
        },
        lastSnapshot: ({ context, event }) => (event.tool === "browser_snapshot" || event.tool === "get_context") ? (event.result || context.lastSnapshot) : context.lastSnapshot,
        phaseDone: ({ context, event }) => event.tool === "__done__" ? true : context.phaseDone,
        hints: ({ context, event }) => event.tool === "suggest_hint" ? (context.hints || "") + `\n[${event.args?.phase}] ${event.args?.new_hint || ""}` : context.hints,
        hintSuggestions: ({ context, event }) => event.tool === "suggest_hint" ? [...(context.hintSuggestions || []), event.args] : context.hintSuggestions,
        solutionId: ({ context, event }) => { if (context.solutionId) return context.solutionId; const m = (event.result || "").match(/\/solutions\/([0-9a-f-]{36})/); return m ? m[1] : context.solutionId; },
        solutionUrl: ({ context, event }) => { if (context.solutionUrl) return context.solutionUrl; const m = (event.result || "").match(/(https?:\/\/[^\s]*\/solutions\/[0-9a-f-]{36}[^\s]*)/); return m ? m[1] : context.solutionUrl; },
        turn: ({ context }) => context.turn + 1,
      }),
      // Forward to AI actor as a "snapshot" event
      sendTo("ai", ({ context, event }) => ({
        type: "snapshot",
        tools: context.aiTools || {},
        system: `You are Zara, browser automation agent for Joule Studio.
Use tools to interact with the browser. Call __done__ when the phase objective is met.

PHASE: ${context.phase}
OBJECTIVE: ${PHASES[context.phase]?.objective || ""}
DONE WHEN: ${PHASES[context.phase]?.done || ""}
SOLUTION: ${context.solutionId || "creating..."}
TASK: ${context.prompt}
${context.hints ? `HINTS:\n${context.hints}` : ""}`,
        prompt: `Last action: [${event.tool}] ${event.error ? "ERROR: " + event.error : (event.result || "ok").substring(0, 500)}

${context.lastSnapshot ? `Page:\n${context.lastSnapshot.substring(0, 2000)}` : ""}

${context.timeline ? `Timeline:\n${context.timeline}` : ""}`,
      })),
      emit(({ event }) => ({
        type: "@progress",
        data: event.tool === "__done__" ? `<div class="text-xs text-green-400 font-semibold">✓ Phase done</div>`
          : event.tool === "suggest_hint" ? `<div class="text-xs text-amber-400">💡 ${event.args?.new_hint || ""}</div>`
          : `<div class="text-xs text-gray-500">← [${event.tool}] ${(event.error || event.result || "").substring(0, 80)}</div>`,
      })),
    ]},

    // AI streams back tool-call parts → forward to pw
    "tool-call": { actions: [
      emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${event.toolName || event.tool}(${JSON.stringify(event.args || {}).substring(0, 50)})</div>` })),
      sendTo("pw", ({ event }) => ({ type: "call", tool: event.toolName || event.tool, args: event.args || {} })),
    ]},

    // AI text output (non-tool) — try to parse as JSON tool call
    "text-delta": { actions: [] }, // accumulate silently

    // AI output complete
    "output": { actions: [
      // Try to parse the full text as a tool call if no tool-call events came
      ({ context, event }) => {
        const text = event.output || "";
        // Try JSON parse
        const start = text.indexOf("{");
        if (start === -1) return;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) {
            try {
              const obj = JSON.parse(text.substring(start, i + 1));
              if (obj.tool) {
                // Forward parsed tool call to pw
                // This is a fallback — ideally tool-call events handle this
              }
            } catch {}
            break;
          }}
        }
      },
    ]},
  },

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: { request: { target: "login", actions: assign({
        prompt: ({ event }) => event.prompt || "", projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
        solutionId: ({ event }) => event.solutionId || null, solutionUrl: ({ event }) => event.solutionUrl || null,
        error: () => null, retries: () => 0, turn: () => 0, history: () => [], timeline: () => "",
        phase: () => "create", hints: () => "", hintSuggestions: () => [], phaseDone: () => false,
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
          entry: sendTo("pw", () => ({ type: "call", tool: "browser_run_code_unsafe", args: { code: `async (page) => { const u = '${globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com"}'; const p = '${globalThis.process?.env?.IAS_PASSWORD || "openCODE1!"}'; try { const e = page.locator('input[type="email"], input[type="text"], input[name*="user"]').first(); await e.fill(u); const b = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first(); await b.click(); await page.waitForTimeout(2000); const pw = page.locator('input[type="password"]').first(); await pw.fill(p); const s = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first(); await s.click(); await page.waitForTimeout(5000); } catch(err) {} return page.url(); }` } })),
          on: { "pw.result": "snapshot" },
        },
        snapshot: { entry: sendTo("pw", { type: "call", tool: "browser_snapshot", args: {} }), on: { "pw.result": "done" } },
        done: { type: "final" },
      },
      onDone: [
        { guard: ({ context }) => !!context.solutionId, target: "building" },
        { target: "create" },
      ],
    },

    // ═══ CREATE ══════════════════════════════════════════════════════════════
    // AI drives browser to create a solution. Transitions when solutionId detected.
    create: {
      entry: [
        assign({ phase: () => "create", phaseDone: () => false }),
        emit({ type: "@status", data: `<span class="text-blue-400">● create</span>` }),
        // Kick off: send initial snapshot to AI to start thinking
        sendTo("pw", { type: "call", tool: "get_context", args: {} }),
      ],
      always: [
        { guard: ({ context }) => !!context.solutionId, target: "building" },
        { guard: ({ context }) => context.phaseDone, target: "building" },
        { guard: ({ context }) => context.turn > context.maxTurns, target: "error", actions: assign({ error: () => "Max turns in create" }) },
      ],
    },

    // ═══ BUILDING (sub-machine) ══════════════════════════════════════════════
    building: {
      initial: "verify",
      entry: emit({ type: "@status", data: `<span class="text-purple-400">● building</span>` }),
      states: {
        verify: {
          entry: sendTo("pw", { type: "call", tool: "get_context", args: {} }),
          on: { "pw.result": [
            { guard: ({ context, event }) => (event.result || context.lastSnapshot || "").includes("/solutions/"), target: "intent" },
            { target: "nav_solution" },
          ]},
        },
        nav_solution: {
          entry: sendTo("pw", ({ context }) => ({ type: "call", tool: "browser_navigate", args: { url: context.solutionUrl || `${globalThis.process?.env?.DAS_HOST || ""}/new/build/solutions/${context.solutionId}` } })),
          on: { "pw.result": "wait_nav" },
        },
        wait_nav: { entry: sendTo("pw", { type: "call", tool: "browser_wait_for", args: { time: 3 } }), on: { "pw.result": "intent" } },

        // Phase states — AI drives via the global event routing
        intent: {
          entry: [assign({ phase: () => "intent", phaseDone: () => false }), emit({ type: "@status", data: `<span class="text-indigo-400">● intent</span>` }), sendTo("pw", { type: "call", tool: "get_context", args: {} })],
          always: [{ guard: ({ context }) => context.phaseDone, target: "requirements" }],
        },
        requirements: {
          entry: [assign({ phase: () => "requirements", phaseDone: () => false }), emit({ type: "@status", data: `<span class="text-indigo-400">● requirements</span>` }), sendTo("pw", { type: "call", tool: "get_context", args: {} })],
          always: [{ guard: ({ context }) => context.phaseDone, target: "solution" }],
        },
        solution: {
          entry: [assign({ phase: () => "solution", phaseDone: () => false }), emit({ type: "@status", data: `<span class="text-indigo-400">● solution</span>` }), sendTo("pw", { type: "call", tool: "get_context", args: {} })],
          always: [{ guard: ({ context }) => context.phaseDone, target: "testing" }],
        },
        testing: {
          entry: [assign({ phase: () => "testing", phaseDone: () => false }), emit({ type: "@status", data: `<span class="text-orange-400">● testing</span>` }), sendTo("pw", { type: "call", tool: "get_context", args: {} })],
          always: [{ guard: ({ context }) => context.phaseDone, target: "deployment" }],
        },
        deployment: {
          entry: [assign({ phase: () => "deployment", phaseDone: () => false }), emit({ type: "@status", data: `<span class="text-orange-400">● deployment</span>` }), sendTo("pw", { type: "call", tool: "get_context", args: {} })],
          always: [{ guard: ({ context }) => context.phaseDone, target: "deployed" }],
        },
        deployed: {
          entry: [assign({ phase: () => "deployed", phaseDone: () => false }), emit({ type: "@status", data: `<span class="text-cyan-400">● deployed</span>` }), sendTo("pw", { type: "call", tool: "get_context", args: {} })],
          always: [{ guard: ({ context }) => context.phaseDone, target: "complete" }],
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
        retry: { target: "login", actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }) },
        request: { target: "login", actions: assign({ prompt: ({ event }) => event.prompt || "", error: () => null, retries: () => 0, turn: () => 0, history: () => [], timeline: () => "" }) },
      },
    },
  },
});

export default machine;
