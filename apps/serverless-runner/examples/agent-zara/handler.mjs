/**
 * Zara — E2E Testing Agent
 *
 * Architecture:
 *   - A long-lived "playwright" callback actor owns the MCP connection for the machine's lifetime
 *   - It's spawned with systemId "pw" so any state can sendTo it
 *   - States send { type: "call", tool, args } events to "pw" actor
 *   - "pw" actor executes the tool and sends { type: "pw.result", tool, result } back to parent
 *   - First state inits the client, gets tools, does login — all inside the same actor/connection
 *   - AI thinking states use the tool results to decide next action
 */

import { assign, emit, enqueueActions, fromCallback, fromPromise, sendTo, setup, spawnChild } from "https://esm.sh/xstate";

// ─── Playwright MCP long-lived actor ────────────────────────────────────────
// This actor holds the connection open for the entire machine run.
// Parent sends: { type: "call", tool, args, id }
// Actor replies: { type: "pw.result", tool, result, error, id }
// Special: { type: "init" } → initialize + list tools → { type: "pw.ready", tools, sessionId }
// Special: { type: "login", targetUrl, username, password } → full login flow → { type: "pw.loggedin", snapshot, log }

const playwrightActor = fromCallback(({ sendBack, receive, input }) => {
  const url = input.url;
  let sessionId = null;
  let tools = [];

  // Raw MCP call — keeps session alive
  async function mcpCall(method, params) {
    const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const res = await globalThis.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: Math.random().toString(36).slice(2), method, params: params || {} }),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
            if (msg.result !== undefined) return msg.result;
          } catch (e) { if (!e.message?.includes("JSON")) throw e; }
        }
      }
      return null; // empty SSE
    }
    if (!res.ok) throw new Error(`MCP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  async function callTool(name, args) {
    return mcpCall("tools/call", { name, arguments: args || {} });
  }

  // Handle events from parent
  receive(async (event) => {
    if (event.type === "init") {
      try {
        await mcpCall("initialize", {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "zara", version: "1.0" },
        });
        // Send initialized notification
        const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
        if (sessionId) headers["Mcp-Session-Id"] = sessionId;
        await globalThis.fetch(url, {
          method: "POST", headers,
          body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        });
        // List tools
        const toolsResult = await mcpCall("tools/list");
        tools = toolsResult?.tools || [];
        sendBack({ type: "pw.ready", tools, sessionId });
      } catch (e) {
        sendBack({ type: "pw.error", error: e.message });
      }
    }

    else if (event.type === "login") {
      try {
        const { targetUrl, username, password } = event;
        const log = [];
        log.push({ tool: "__debug__", result: `sessionId=${sessionId}` });

        if (!sessionId) throw new Error("No session ID — init may not have completed");

        // Navigate
        await callTool("browser_navigate", { url: targetUrl });
        log.push({ tool: "navigate", result: "ok" });
        await callTool("browser_wait_for", { time: 3 });

        // Snapshot
        const snap = await callTool("browser_snapshot", {});
        const snapText = snap?.content?.map(c => c.text || "").join("\n") || "";
        log.push({ tool: "snapshot", result: snapText.substring(0, 150) });

        // Already logged in?
        if (snapText.includes("Conversations") || snapText.includes("Spaces") || snapText.includes("Develop")) {
          sendBack({ type: "pw.loggedin", snapshot: snapText, log, alreadyLoggedIn: true });
          return;
        }

        // Login via Playwright code (most reliable)
        await callTool("browser_run_code_unsafe", {
          code: `async (page) => {
            const e = page.locator('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]').first();
            await e.fill('${username}');
            const b = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first();
            await b.click();
            await page.waitForTimeout(2000);
            const p = page.locator('input[type="password"]').first();
            await p.fill('${password}');
            const s = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first();
            await s.click();
            await page.waitForTimeout(5000);
            return page.url();
          }`
        });
        log.push({ tool: "login_code", result: "executed" });

        // Final snapshot
        const snap2 = await callTool("browser_snapshot", {});
        const finalSnap = snap2?.content?.map(c => c.text || "").join("\n") || "";
        log.push({ tool: "final_snapshot", result: finalSnap.substring(0, 150) });

        const success = /Conversations|Spaces|Develop|Build|\/new/.test(finalSnap);
        sendBack({ type: "pw.loggedin", snapshot: finalSnap, log, success });
      } catch (e) {
        sendBack({ type: "pw.error", error: `login: ${e.message}` });
      }
    }

    else if (event.type === "call") {
      try {
        const result = await callTool(event.tool, event.args);
        const text = result?.content?.map(c => c.text || c.data || "").join("\n") || JSON.stringify(result);
        sendBack({ type: "pw.result", tool: event.tool, args: event.args, result: text, id: event.id });
      } catch (e) {
        sendBack({ type: "pw.result", tool: event.tool, args: event.args, error: e.message, id: event.id });
      }
    }
  });

  // Cleanup on machine stop
  return () => {
    if (sessionId) {
      callTool("browser_close", {}).catch(() => {});
    }
  };
});

// ─── AI decision actor ──────────────────────────────────────────────────────

const aiDecide = fromPromise(async ({ input }) => {
  const baseUrl = globalThis.process?.env?.OPENAI_BASE_URL || "http://ai-core-proxy:3030/v1";
  const apiKey = globalThis.process?.env?.OPENAI_API_KEY || "proxy";
  const model = globalThis.process?.env?.AI_MODEL || "gpt-4o";

  const res = await globalThis.fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
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
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).substring(0, 200)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildToolCatalog(tools) {
  return tools.map(t => {
    const params = t.inputSchema?.properties
      ? Object.entries(t.inputSchema.properties).map(([k, v]) => `  ${k}: ${v.description || v.type || "any"}`).join("\n")
      : "";
    return `- ${t.name}: ${t.description || ""}${params ? "\n" + params : ""}`;
  }).join("\n");
}

function parseToolCall(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) {
      try { const obj = JSON.parse(text.substring(start, i + 1)); if (obj.tool) return obj; } catch {}
      break;
    }}
  }
  return null;
}

function formatHistory(history, limit = 8) {
  return history.slice(-limit).map(h =>
    `[${h.tool}] ${h.error ? "ERR: " + h.error : (h.result || "").substring(0, 200)}`
  ).join("\n");
}

function buildSystemPrompt(ctx) {
  return `You are Zara, a browser automation agent. You control a browser via tools.
Available tools:
${ctx.toolCatalog}

Rules:
1. Respond with ONLY a JSON object: {"tool": "tool_name", "args": {...}}
2. Use "target" with exact ref from snapshot (e.g. "S1e2")
3. Always snapshot first if you don't know page state: {"tool": "browser_snapshot", "args": {}}
4. When phase objective is DONE: {"tool": "__done__", "args": {}}

Phase: ${ctx.phase}
Objectives:
- create: Find chat input, type "${ctx.prompt}", submit. Done when URL has /solutions/<uuid>.
- intent: Answer Joule questions. Done when Intent ✓ or Requirements active.
- requirements: Wait. Done when Requirements ✓ or Solution active.
- solution: Wait. Done when Solution ✓ or Try/Test button.
- testing: Click Try, test. Done when Deploy enabled.
- deployment: Click Deploy, wait. Done when Running/Deployed.
- deployed: Verify in Conversations. Done when agent responds.

JSON only. No explanation.`;
}

function buildUserPrompt(ctx) {
  const parts = [`Phase: ${ctx.phase}`, `Turn: ${ctx.turn}`];
  if (ctx.lastSnapshot) parts.push(`Page:\n${ctx.lastSnapshot.substring(0, 3000)}`);
  if (ctx.history.length) parts.push(`Recent:\n${formatHistory(ctx.history)}`);
  else parts.push("No actions yet. Start with browser_snapshot.");
  return parts.join("\n\n");
}

// ─── The Machine ────────────────────────────────────────────────────────────

export const machine = setup({
  actors: { playwrightActor, aiDecide },
  types: { input: {}, context: {}, emitted: {} },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    tools: [],
    toolCatalog: "",
    projectId: input?.projectId || "",
    prompt: input?.prompt || "",
    phase: "create",
    solutionId: null,
    lastSnapshot: "",
    history: [],
    pendingAction: null,
    error: null,
    retries: 0,
    turn: 0,
    maxTurns: 50,
    ...input,
  }),

  entry: [
    emit({
      type: "message",
      data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100">
        <header class="sticky top-0 z-10 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4">
          <span class="text-lg font-semibold text-purple-400">Zara — E2E Tester</span>
          <span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span>
        </header>
        <div class="mt-4 space-y-1 max-h-[70vh] overflow-y-auto" sse-swap="@progress" hx-swap="beforeend"></div>
        <form class="mt-4 flex gap-2">
          <input type="text" name="prompt" placeholder="Describe what to test..."
                 class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg" />
          <button type="submit" hx-post="events/request"
                  class="px-6 py-3 bg-purple-600 rounded-lg hover:bg-purple-700">Start</button>
        </form>
      </main>`,
    }),
    spawnChild("playwrightActor", {
      id: "pw",
      systemId: "pw",
      input: { url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp-local.agents.svc.cluster.local:8931/mcp" },
    }),
  ],

  states: {
    // ═══ IDLE ════════════════════════════════════════════════════════════════
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: {
        request: {
          target: "initializing",
          actions: assign({
            prompt: ({ event }) => event.prompt || "",
            projectId: ({ event }) => event.projectId || `s-${Date.now()}`,
            error: () => null, retries: () => 0, turn: () => 0,
            history: () => [], phase: () => "create", lastSnapshot: () => "",
          }),
        },
      },
    },

    // ═══ INITIALIZING: tell pw actor to init MCP client ═════════════════════
    initializing: {
      entry: [
        emit({ type: "@status", data: `<span class="text-yellow-400">● initializing</span>` }),
        sendTo("pw", { type: "init" }),
      ],
      on: {
        "pw.ready": {
          target: "logging_in",
          actions: [
            assign({
              tools: ({ event }) => event.tools,
              toolCatalog: ({ event }) => buildToolCatalog(event.tools),
            }),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-green-400">✓ Playwright: ${event.tools.length} tools (session=${event.sessionId})</div>`,
            })),
          ],
        },
        "pw.error": {
          target: "error",
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },

    // ═══ LOGGING IN: tell pw actor to login ══════════════════════════════════
    logging_in: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● logging in</span>` }),
        sendTo("pw", ({ context }) => ({
          type: "login",
          targetUrl: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build",
          username: globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com",
          password: globalThis.process?.env?.IAS_PASSWORD || "openCODE1!",
        })),
      ],
      on: {
        "pw.loggedin": {
          target: "thinking",
          actions: [
            assign({
              lastSnapshot: ({ event }) => event.snapshot || "",
              history: ({ event }) => event.log || [],
            }),
            emit({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Logged in</div>` }),
          ],
        },
        "pw.error": {
          target: "error",
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },

    // ═══ THINKING: AI decides next tool call ═════════════════════════════════
    thinking: {
      entry: [
        assign({ turn: ({ context }) => context.turn + 1 }),
        emit(({ context }) => ({
          type: "@status",
          data: `<span class="text-blue-400">● ${context.phase}</span> turn ${context.turn}`,
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
            guard: ({ event }) => {
              const p = parseToolCall(event.output || "");
              return !p || p.tool === "__done__";
            },
            target: "transition",
          },
          {
            target: "acting",
            actions: assign({
              pendingAction: ({ event }) => parseToolCall(event.output || "") || { tool: "browser_snapshot", args: {} },
            }),
          },
        ],
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `AI: ${event.error?.message}` }),
        },
      },
    },

    // ═══ ACTING: send tool call to pw actor, wait for result ═════════════════
    acting: {
      entry: [
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-xs text-blue-300">→ ${context.pendingAction?.tool}(${JSON.stringify(context.pendingAction?.args || {}).substring(0, 80)})</div>`,
        })),
        sendTo("pw", ({ context }) => ({
          type: "call",
          tool: context.pendingAction.tool,
          args: context.pendingAction.args || {},
          id: context.turn,
        })),
      ],
      on: {
        "pw.result": {
          target: "thinking",
          actions: [
            assign({
              history: ({ context, event }) => [...context.history, { tool: event.tool, args: event.args, result: event.result, error: event.error }],
              lastSnapshot: ({ context, event }) => event.tool === "browser_snapshot" ? (event.result || context.lastSnapshot) : context.lastSnapshot,
              pendingAction: () => null,
            }),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-gray-500">  ← ${(event.result || event.error || "").substring(0, 100)}</div>`,
            })),
          ],
        },
        "pw.error": {
          target: "thinking",
          actions: assign({
            history: ({ context, event }) => [...context.history, { tool: context.pendingAction?.tool, error: event.error }],
            pendingAction: () => null,
          }),
        },
      },
    },

    // ═══ TRANSITION: advance to next phase ═══════════════════════════════════
    transition: {
      entry: emit(({ context }) => ({
        type: "@progress",
        data: `<div class="text-xs text-green-400 font-semibold">✓ ${context.phase} complete</div>`,
      })),
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
    done: {
      type: "final",
      entry: [
        emit({ type: "@status", data: `<span class="text-green-400">● done ✓</span>` }),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-sm text-green-400 font-bold mt-4">✓ Complete — ${context.history.length} actions</div>`,
        })),
      ],
    },

    // ═══ ERROR ═══════════════════════════════════════════════════════════════
    error: {
      entry: [
        emit(({ context }) => ({ type: "@status", data: `<span class="text-red-400">● error — ${context.error}</span>` })),
        emit(({ context }) => ({ type: "@progress", data: `<div class="text-xs text-red-400">✗ ${context.error}</div>` })),
      ],
      on: {
        retry: {
          guard: ({ context }) => context.retries < 3,
          target: "initializing",
          actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }),
        },
        request: {
          target: "initializing",
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

export default machine;
