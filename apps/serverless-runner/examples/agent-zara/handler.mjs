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

/** Extract a JSON tool call from AI text output. Handles nested braces. */
function parseToolCall(text) {
  // Find the first { and match balanced braces
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) {
      try { 
        const obj = JSON.parse(text.substring(start, i + 1));
        if (obj.tool) return obj;
      } catch {} 
      break;
    }}
  }
  return null;
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

/**
 * Deterministic IAS login — no AI needed for this predictable form.
 * Steps: navigate → snapshot → fill email → continue → fill password → sign in → verify
 */
const performLogin = fromPromise(async ({ input }) => {
  const { pw, targetUrl, username, password } = input;
  const log = [];

  // 1. Navigate to target
  const navResult = await pw.tool("browser_navigate", { url: targetUrl });
  log.push({ tool: "browser_navigate", args: { url: targetUrl }, result: "navigated" });

  // 2. Wait for page load
  await pw.tool("browser_wait_for", { time: 3 });

  // 3. Take snapshot to see what we got
  const snap1 = await pw.tool("browser_snapshot", {});
  const snapText = snap1?.content?.map(c => c.text || "").join("\n") || "";
  log.push({ tool: "browser_snapshot", result: snapText.substring(0, 200) });

  // 4. Check if we're on IAS login page or already authenticated
  if (snapText.includes("Conversations") || snapText.includes("Spaces") || snapText.includes("Develop")) {
    log.push({ tool: "__done__", result: "Already authenticated" });
    return { success: true, log, snapshot: snapText };
  }

  // 5. IAS login — try filling email field
  // The IAS form has: textbox "E-Mail or User Name" and button "Continue"
  try {
    await pw.tool("browser_type", { target: "textbox \"E-Mail or User Name\"", text: username, submit: false });
    log.push({ tool: "browser_type", args: { target: "email field" }, result: "filled" });
  } catch (e1) {
    // Fallback: try other selectors
    try {
      await pw.tool("browser_type", { target: "input[name=\"j_username\"]", text: username, submit: false });
      log.push({ tool: "browser_type", args: { target: "j_username" }, result: "filled" });
    } catch (e2) {
      // Last resort: use code
      await pw.tool("browser_run_code_unsafe", { 
        code: `async (page) => { const input = page.locator('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]').first(); await input.fill('${username}'); }` 
      });
      log.push({ tool: "browser_run_code_unsafe", result: "filled via code" });
    }
  }

  // 6. Click Continue/Log On
  await pw.tool("browser_wait_for", { time: 1 });
  try {
    await pw.tool("browser_click", { target: "button \"Continue\"" });
    log.push({ tool: "browser_click", args: { target: "Continue" }, result: "clicked" });
  } catch {
    try {
      await pw.tool("browser_click", { target: "button \"Log On\"" });
      log.push({ tool: "browser_click", args: { target: "Log On" }, result: "clicked" });
    } catch {
      await pw.tool("browser_run_code_unsafe", { 
        code: `async (page) => { const btn = page.locator('button, input[type="submit"]').filter({hasText: /continue|log on|sign in/i}).first(); await btn.click(); }` 
      });
      log.push({ tool: "code_click", result: "clicked via code" });
    }
  }

  // 7. Wait for password page
  await pw.tool("browser_wait_for", { time: 2 });

  // 8. Fill password
  try {
    await pw.tool("browser_type", { target: "textbox \"Password\"", text: password, submit: false });
    log.push({ tool: "browser_type", args: { target: "password" }, result: "filled" });
  } catch {
    await pw.tool("browser_run_code_unsafe", { 
      code: `async (page) => { const input = page.locator('input[type="password"]').first(); await input.fill('${password}'); }` 
    });
    log.push({ tool: "code_fill_password", result: "filled via code" });
  }

  // 9. Click Log On / Sign In
  await pw.tool("browser_wait_for", { time: 1 });
  try {
    await pw.tool("browser_click", { target: "button \"Log On\"" });
  } catch {
    try {
      await pw.tool("browser_click", { target: "button \"Continue\"" });
    } catch {
      await pw.tool("browser_run_code_unsafe", { 
        code: `async (page) => { const btn = page.locator('button, input[type="submit"]').filter({hasText: /log on|continue|sign in/i}).first(); await btn.click(); }` 
      });
    }
  }
  log.push({ tool: "browser_click", args: { target: "submit" }, result: "clicked" });

  // 10. Wait for redirect back to app
  await pw.tool("browser_wait_for", { time: 5 });

  // 11. Final snapshot to verify
  const snap2 = await pw.tool("browser_snapshot", {});
  const finalSnap = snap2?.content?.map(c => c.text || "").join("\n") || "";
  log.push({ tool: "browser_snapshot", result: finalSnap.substring(0, 200) });

  const success = finalSnap.includes("Conversations") || finalSnap.includes("Spaces") || 
                  finalSnap.includes("Develop") || finalSnap.includes("Build") ||
                  finalSnap.includes("/new");

  return { success, log, snapshot: finalSnap };
});

// ─── The Machine ────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    connectPlaywright,
    execTool,
    performLogin,
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
          target: "authenticating",
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
    // AUTHENTICATING: Deterministic IAS login (no AI needed)
    // ═══════════════════════════════════════════════════════════════════════
    authenticating: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● authenticating</span>` }),
        emit({ type: "@progress", data: `<div class="text-xs text-gray-400">Logging in to Joule Studio...</div>` }),
      ],
      invoke: {
        src: "performLogin",
        input: ({ context }) => ({
          pw: context.pw,
          targetUrl: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build",
          username: globalThis.process?.env?.IAS_USERNAME || "opencode@pyzlo.com",
          password: globalThis.process?.env?.IAS_PASSWORD || "openCODE1!",
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.success,
            target: "thinking",
            actions: [
              assign({
                phase: () => "create",
                lastSnapshot: ({ event }) => event.output.snapshot || "",
                history: ({ event }) => event.output.log || [],
              }),
              emit({ type: "@progress", data: `<div class="text-xs text-green-400">✓ Logged in</div>` }),
            ],
          },
          {
            target: "error",
            actions: assign({
              error: ({ event }) => `Login failed — page: ${(event.output.snapshot || "").substring(0, 100)}`,
              history: ({ event }) => event.output.log || [],
            }),
          },
        ],
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `Login error: ${event.error?.message}` }),
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
              const parsed = parseToolCall(event.output || "");
              return !parsed || parsed.tool === "__done__";
            },
            target: "transition",
          },
          {
            // AI specified a tool → go execute it
            target: "acting",
            actions: assign({
              pendingAction: ({ event }) => {
                return parseToolCall(event.output || "") || { tool: "browser_snapshot", args: {} };
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
You control a browser via Playwright MCP tools. Available tools:
${context.toolCatalog}

IMPORTANT RULES:
1. Respond with ONLY a JSON object: {"tool": "tool_name", "args": {...}}
2. Always use "target" field with the exact ref from the snapshot (e.g. "S1e2f3" or quoted text)
3. To type text use: {"tool": "browser_type", "args": {"target": "<ref>", "text": "...", "submit": false}}
4. To click use: {"tool": "browser_click", "args": {"target": "<ref>"}}
5. Always take a snapshot first if you don't know the page state: {"tool": "browser_snapshot", "args": {}}
6. When the current phase objective is COMPLETE, respond: {"tool": "__done__", "args": {}}

Current phase: ${context.phase}
Phase objectives:
- create: Find the chat input, type the solution description, submit. Done when URL contains /solutions/<uuid>.
- intent: Answer Joule's clarifying questions via chat. Done when Intent step shows ✓ or Requirements becomes active.
- requirements: Wait/answer questions. Done when Requirements shows ✓ or Solution step becomes active.
- solution: Wait for code generation. Done when Solution shows ✓ or Try/Test/Deploy button appears.
- testing: Click Try, test the solution in sandbox. Done when Deploy button is enabled.
- deployment: Click Deploy, wait for status Running/Deployed. Done when deployed.
- deployed: Navigate to Conversations, @mention agent, verify response. Done when agent responds.

NO explanations. JSON only.`;
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
