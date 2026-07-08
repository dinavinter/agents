/**
 * Zara — E2E Testing Agent
 *
 * pw actor: inits MCP on spawn (eager), proxies tool calls, streams results back
 * thinking state: uses fromAIEventStream — AI streams tool-call elements
 * each element → sendTo pw → pw.result accumulates → feeds next AI turn
 */

import { assign, emit, fromCallback, fromPromise, sendTo, setup, spawnChild } from "https://esm.sh/xstate";
import { fromAIEventStream } from "https://esm.sh/@cxai/stream";
import { Client } from "https://esm.sh/@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "https://esm.sh/@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─── Playwright MCP actor ───────────────────────────────────────────────────
// Inits eagerly on spawn. Sends pw.ready with tools once connected.
// Receives { type: "call", tool, args } → executes → sends { type: "pw.result", ... }

const playwrightActor = fromCallback(({ sendBack, receive, input }) => {
  const client = new Client({ name: "zara", version: "1.0" });
  let connected = false;

  // Eager init on spawn
  (async () => {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(input.url));
      await client.connect(transport);
      connected = true;
      const { tools } = await client.listTools();
      sendBack({ type: "pw.ready", tools: tools || [] });
    } catch (e) {
      sendBack({ type: "pw.error", error: e.message });
    }
  })();

  // Handle tool calls
  receive(async (event) => {
    if (event.type === "call") {
      if (event.tool === "suggest_hint") {
        sendBack({ type: "pw.result", tool: "suggest_hint", args: event.args, result: `Hint saved: [${event.args?.phase}] ${event.args?.new_hint}` });
        return;
      }
      if (event.tool === "__done__") {
        sendBack({ type: "pw.result", tool: "__done__", args: event.args, result: "phase complete" });
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

// ─── AI actor (direct fetch — reliable) ─────────────────────────────────────

const aiDecide = fromPromise(async ({ input }) => {
  const baseUrl = globalThis.process?.env?.OPENAI_BASE_URL || "http://ai-core-proxy:3030/v1";
  const apiKey = globalThis.process?.env?.OPENAI_API_KEY || "proxy";
  const model = globalThis.process?.env?.AI_MODEL || "gpt-4o";
  const res = await globalThis.fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }], max_tokens: 400, temperature: 0.1 }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).substring(0, 200)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  const pw = tools.map(t => `- ${t.name}: ${t.description || ""}`).join("\n");
  return `${pw}\n- suggest_hint: Save a UI hint for future runs. Args: {phase, old_hint, new_hint}\n- __done__: Phase complete. Args: {}`;
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
  return `You are Zara, a browser automation agent testing Joule Studio.

RESPOND WITH ONLY ONE JSON: {"tool":"name","args":{...}}
Phase complete: {"tool":"__done__","args":{}}

RULES:
1. ALWAYS browser_snapshot FIRST if you don't know page state or after errors
2. Use "target" with refs from snapshot (ref=e22 → target:"e22")
3. URL is most reliable signal — check "Page URL:" in snapshot
4. If same error 3+ times, snapshot and try different approach
5. If a hint is wrong, call suggest_hint then continue

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
- Chat input: look for textbox, textarea, or role="textbox" in snapshot
- Submit: Enter key (submit:true) or Send button
- If URL already has /solutions/ at start of create phase → already done
- Stepper phases may be tabs, breadcrumbs, or status badges
- After navigation, always wait 2-3s then snapshot

${ctx.hints ? `LEARNED:\n${ctx.hints}` : ""}

TOOLS:\n${ctx.toolCatalog}`;
}

function buildUserPrompt(ctx) {
  const parts = [`Phase: ${ctx.phase} | Turn: ${ctx.turn}/${ctx.maxTurns}`];
  if (ctx.lastSnapshot) {
    const urlMatch = ctx.lastSnapshot.match(/Page URL: ([^\n]+)/);
    if (urlMatch) parts.push(`URL: ${urlMatch[1]}`);
    parts.push(`Snapshot:\n${ctx.lastSnapshot.substring(0, 3000)}`);
  }
  if (ctx.history.length) {
    parts.push(`Last ${Math.min(5, ctx.history.length)} actions:\n${ctx.history.slice(-5).map(h => `[${h.tool}] ${(h.error || h.result || "ok").substring(0, 120)}`).join("\n")}`);
  } else {
    parts.push("No actions yet — start with browser_snapshot.");
  }
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
    loginStep: 0, hints: "", hintSuggestions: [],
    ...input,
  }),

  // Spawn pw actor eagerly — it inits MCP immediately
  entry: [
    emit({ type: "message", data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100"><header class="sticky top-0 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4"><span class="text-lg font-semibold text-purple-400">Zara</span><span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span></header><div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div><form class="mt-4 flex gap-2"><input type="text" name="prompt" placeholder="What to test..." class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg"/><button type="submit" hx-post="events/request" class="px-6 py-3 bg-purple-600 rounded-lg">Start</button></form></main>` }),
    spawnChild("playwrightActor", {
      id: "pw", systemId: "pw",
      input: { url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp" },
    }),
  ],

  // pw.ready can arrive at any state — store tools when it does
  on: {
    "pw.ready": { actions: [
      assign({ tools: ({ event }) => event.tools, toolCatalog: ({ event }) => buildToolCatalog(event.tools) }),
      emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Playwright: ${event.tools.length} tools</div>` })),
    ]},
    "pw.error": { target: ".error", actions: assign({ error: ({ event }) => `PW: ${event.error}` }) },
  },

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: { request: { target: "login_navigate", actions: assign({
        prompt: ({ event }) => event.prompt || "", projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
        error: () => null, retries: () => 0, turn: () => 0, history: () => [],
        phase: () => "create", loginStep: () => 0, hints: () => "", hintSuggestions: () => [],
      })}},
    },

    // ═══ LOGIN: navigate → wait → fill → verify ═════════════════════════════
    login_navigate: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● login</span>` }),
        sendTo("pw", () => ({
          type: "call", tool: "browser_navigate",
          args: { url: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build" },
        })),
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
        sendTo("pw", () => ({
          type: "call", tool: "browser_run_code_unsafe",
          args: { code: `async (page) => { const u = '${globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com"}'; const p = '${globalThis.process?.env?.IAS_PASSWORD || "openCODE1!"}'; try { const e = page.locator('input[type="email"], input[type="text"], input[name*="user"]').first(); await e.fill(u); const b = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first(); await b.click(); await page.waitForTimeout(2000); const pw = page.locator('input[type="password"]').first(); await pw.fill(p); const s = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first(); await s.click(); await page.waitForTimeout(5000); } catch(err) {} return page.url(); }` },
        })),
      ],
      on: { "pw.result": "login_verify" },
    },
    login_verify: {
      entry: sendTo("pw", { type: "call", tool: "browser_snapshot", args: {} }),
      on: {
        "pw.result": {
          target: "thinking",
          actions: [
            assign({ lastSnapshot: ({ event }) => event.result || "", history: ({ event }) => [{ tool: "login", result: (event.result || "").substring(0, 200) }] }),
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

    // ═══ ACTING: send to pw, get result, loop back ═══════════════════════════
    acting: {
      entry: [
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-blue-300">→ ${context.pendingAction?.tool}(${JSON.stringify(context.pendingAction?.args || {}).substring(0, 60)})</div>` })),
        sendTo("pw", ({ context }) => ({ type: "call", tool: context.pendingAction.tool, args: context.pendingAction.args || {} })),
      ],
      on: {
        "pw.result": [
          { guard: ({ event }) => event.tool === "__done__", target: "transition" },
          { guard: ({ event }) => event.tool === "suggest_hint", target: "thinking", actions: [
            assign({
              hintSuggestions: ({ context, event }) => [...(context.hintSuggestions || []), event.args],
              hints: ({ context, event }) => (context.hints || "") + `\n[${event.args?.phase}] ${event.args?.new_hint || ""}`,
              history: ({ context, event }) => [...context.history, { tool: "suggest_hint", result: event.result }],
            }),
            emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-amber-400">💡 ${event.args?.new_hint || ""}</div>` })),
          ]},
          { target: "thinking", actions: [
            assign({
              history: ({ context, event }) => [...context.history, { tool: event.tool, result: event.result, error: event.error }],
              lastSnapshot: ({ context, event }) => event.tool === "browser_snapshot" ? (event.result || context.lastSnapshot) : context.lastSnapshot,
              pendingAction: () => null,
            }),
            emit(({ event }) => ({ type: "@progress", data: `<div class="text-xs text-gray-500">← ${(event.error || event.result || "").substring(0, 80)}</div>` })),
          ]},
        ],
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
      emit(({ context }) => ({ type: "@progress", data: `<div class="text-sm text-green-400 font-bold mt-4">✓ ${context.history.length} actions, ${context.hintSuggestions.length} hints suggested</div>` })),
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
