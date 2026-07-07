/**
 * Zara — E2E Testing Agent (Serverless Handler)
 *
 * Flat state machine that drives Joule Studio E2E testing via Playwright MCP.
 * Per-session Playwright connection — initialized on request, closed on done/error.
 *
 * Deployed as a Kyma serverless function via the agent-runner.
 * The runner wraps this XState machine in an HTTP handler with SSE streaming.
 *
 * States: idle → connecting → authenticating → create → intent →
 *         requirements → solution → testing → deployment → deployed → done
 */

import { assign, emit, fromCallback, fromPromise, setup } from "https://esm.sh/xstate";
import "https://esm.sh/yjs";

// ─── Playwright MCP Client (HTTP streamable transport) ──────────────────────

class PlaywrightMCP {
  #url;
  #sessionId = null;

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

    // Handle SSE vs JSON response
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

    // Non-SSE response
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
  }

  async tool(name, args = {}) {
    return this.call("tools/call", { name, arguments: args });
  }

  async navigate(url) { return this.tool("browser_navigate", { url }); }
  async snapshot() { return this.tool("browser_snapshot"); }
  async screenshot(name) { return this.tool("browser_take_screenshot", name ? { name } : {}); }
  async click(element, ref) { return this.tool("browser_click", { element, ...(ref ? { ref } : {}) }); }
  async fill(element, value, ref) { return this.tool("browser_type", { element, value, ...(ref ? { ref } : {}) }); }
  async code(js) { return this.tool("browser_run_code_unsafe", { code: js }); }
  async close() { try { await this.tool("browser_close"); } catch {} }

  get id() { return this.#sessionId; }
}

// ─── Actors ─────────────────────────────────────────────────────────────────

const connectPlaywright = fromPromise(async ({ input }) => {
  const pw = new PlaywrightMCP(input.url);
  await pw.init();
  // Note: tracing starts after first navigation (no page yet)
  return pw;
});

const pwTool = fromPromise(async ({ input }) => {
  const { pw, tool, args } = input;
  return pw.tool(tool, args || {});
});

const pwNavigate = fromPromise(async ({ input }) => {
  return input.pw.navigate(input.url);
});

const pwSnapshot = fromPromise(async ({ input }) => {
  return input.pw.snapshot();
});

const pwScreenshot = fromPromise(async ({ input }) => {
  return input.pw.screenshot(input.name || "screenshot");
});

const pwLogin = fromPromise(async ({ input }) => {
  const { pw, username, password, targetUrl } = input;
  // Navigate to target — if redirected to IAS, login
  await pw.navigate(targetUrl);
  // Wait a moment for redirect
  await new Promise(r => setTimeout(r, 3000));
  const snap = await pw.snapshot();
  const text = JSON.stringify(snap);

  // Check if we're on the login page
  if (text.includes("E-Mail") || text.includes("Sign In") || text.includes("Log On") || text.includes("Password")) {
    // Fill username
    await pw.fill("E-Mail or User Name", username);
    await pw.click("Continue");
    await new Promise(r => setTimeout(r, 1500));
    // Fill password
    await pw.fill("Password", password);
    await pw.click("Log On");
    // Wait for redirect
    await new Promise(r => setTimeout(r, 5000));
  }

  // Verify we landed on the app
  const afterSnap = await pw.snapshot();
  return afterSnap;
});

const saveTrace = fromPromise(async ({ input }) => {
  const { pw, path } = input;
  await pw.code(`await page.context().tracing.stop({ path: "${path}" });`);
  await pw.close();
});

// ─── The Machine ────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    connectPlaywright,
    pwTool,
    pwNavigate,
    pwSnapshot,
    pwScreenshot,
    pwLogin,
    saveTrace,
  },
  types: {
    input: {},
    context: {},
    emitted: {},
  },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    pw: null,
    projectId: input?.projectId || "",
    prompt: input?.prompt || "",
    solutionId: null,
    solutionUrl: null,
    error: null,
    retries: 0,
    ...input,
  }),

  // Initial UI
  entry: emit({
    type: "message",
    data: `<main class="mx-auto bg-gray-900 min-h-screen p-6 text-gray-100">
      <header class="sticky top-0 z-10 backdrop-blur-md border-b border-gray-700 flex items-center justify-between p-4">
        <span class="text-lg font-semibold text-purple-400">Zara — E2E Tester</span>
        <span class="text-sm" sse-swap="@status" hx-swap="innerHTML">● idle</span>
      </header>
      <div class="mt-4 space-y-3" sse-swap="@progress" hx-swap="beforeend"></div>
      <form class="mt-4 flex gap-2">
        <input type="text" name="prompt" placeholder="Describe what to test..."
               class="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg" />
        <button type="submit" hx-post="events/request"
                class="px-6 py-3 bg-purple-600 rounded-lg hover:bg-purple-700">Start</button>
      </form>
    </main>`,
  }),

  states: {
    // ─── Idle ─────────────────────────────────────────────────────────────
    idle: {
      entry: emit({ type: "@status", data: `<span class="text-green-400">● idle</span>` }),
      on: {
        request: {
          target: "connecting",
          actions: assign({
            prompt: ({ event }) => event.prompt || "",
            projectId: ({ event }) => event.projectId || `session-${Date.now()}`,
            error: () => null,
            retries: () => 0,
          }),
        },
      },
    },

    // ─── Connecting to Playwright MCP ─────────────────────────────────────
    connecting: {
      entry: [
        emit({ type: "@status", data: `<span class="text-yellow-400">● connecting</span> — Playwright MCP...` }),
        emit({ type: "@progress", data: `<div class="text-xs text-gray-400">[${new Date().toLocaleTimeString()}] Connecting to Playwright MCP...</div>` }),
      ],
      invoke: {
        src: "connectPlaywright",
        input: ({ context }) => ({
          url: globalThis.process?.env?.PLAYWRIGHT_MCP_URL || "http://playwright-mcp:8931/mcp",
          session: context.projectId,
        }),
        onDone: {
          target: "authenticating",
          actions: [
            assign({ pw: ({ event }) => event.output }),
            emit({ type: "@progress", data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Playwright connected</div>` }),
          ],
        },
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `Playwright connection failed: ${event.error?.message || "unknown"}` }),
        },
      },
    },

    // ─── Authenticating via IAS ───────────────────────────────────────────
    authenticating: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● authenticating</span> — IAS login...` }),
        emit({ type: "@progress", data: `<div class="text-xs text-gray-400">[${new Date().toLocaleTimeString()}] Logging into Joule Studio...</div>` }),
      ],
      invoke: {
        src: "pwLogin",
        input: ({ context }) => ({
          pw: context.pw,
          username: globalThis.process?.env?.IAS_USERNAME || "",
          password: globalThis.process?.env?.IAS_PASSWORD || "",
          targetUrl: (globalThis.process?.env?.DAS_HOST || "https://joule-studio.example.com") + "/new/build",
        }),
        onDone: {
          target: "create",
          actions: [
            emit({ type: "@status", data: `<span class="text-green-400">● authenticated</span>` }),
            emit({ type: "@progress", data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Logged in</div>` }),
          ],
        },
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => `Login failed: ${event.error?.message || "unknown"}` }),
        },
      },
      on: {
        "auth.success": { target: "create" },
        "auth.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.reason }),
        },
      },
    },

    // ─── Create: prompt Joule ─────────────────────────────────────────────
    create: {
      entry: [
        emit({ type: "@status", data: `<span class="text-blue-400">● create</span> — Prompting Joule...` }),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-xs text-gray-400">[${new Date().toLocaleTimeString()}] Sending to Joule: "${(context.prompt || "").substring(0, 80)}..."</div>`,
        })),
      ],
      on: {
        "create.done": {
          target: "intent",
          actions: [
            assign({
              solutionId: ({ event }) => event.solutionId,
              solutionUrl: ({ event }) => event.solutionUrl,
            }),
            emit(({ event }) => ({
              type: "@progress",
              data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Solution: ${event.solutionId}</div>`,
            })),
          ],
        },
        "create.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.reason }),
        },
      },
    },

    // ─── Intent ───────────────────────────────────────────────────────────
    intent: {
      entry: emit({ type: "@status", data: `<span class="text-indigo-400">● intent</span> — Clarifying...` }),
      on: {
        "intent.complete": {
          target: "requirements",
          actions: emit(({ event }) => ({
            type: "@progress",
            data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Intent: ${event.summary || "done"}</div>`,
          })),
        },
      },
    },

    // ─── Requirements ─────────────────────────────────────────────────────
    requirements: {
      entry: emit({ type: "@status", data: `<span class="text-indigo-400">● requirements</span> — Generating...` }),
      on: {
        "requirements.complete": {
          target: "solution",
          actions: emit(({ event }) => ({
            type: "@progress",
            data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Requirements: ${event.components || "done"}</div>`,
          })),
        },
      },
    },

    // ─── Solution ─────────────────────────────────────────────────────────
    solution: {
      entry: emit({ type: "@status", data: `<span class="text-indigo-400">● solution</span> — Generating code...` }),
      on: {
        "solution.ready": {
          target: "testing",
          actions: emit({
            type: "@progress",
            data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Solution generated</div>`,
          }),
        },
      },
    },

    // ─── Testing ──────────────────────────────────────────────────────────
    testing: {
      entry: emit({ type: "@status", data: `<span class="text-orange-400">● testing</span> — Sandbox...` }),
      on: {
        "test.passed": {
          target: "deployment",
          actions: emit({
            type: "@progress",
            data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Tests passed</div>`,
          }),
        },
        "test.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.reason }),
        },
      },
    },

    // ─── Deployment ───────────────────────────────────────────────────────
    deployment: {
      entry: emit({ type: "@status", data: `<span class="text-orange-400">● deployment</span> — Deploying...` }),
      on: {
        "deploy.success": {
          target: "deployed",
          actions: emit(({ event }) => ({
            type: "@progress",
            data: `<div class="text-xs text-green-400">[${new Date().toLocaleTimeString()}] ✓ Deployed: ${event.deployUrl || "ok"}</div>`,
          })),
        },
        "deploy.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.reason }),
        },
      },
    },

    // ─── Deployed: verify ─────────────────────────────────────────────────
    deployed: {
      entry: emit({ type: "@status", data: `<span class="text-cyan-400">● deployed</span> — Verifying...` }),
      on: {
        verified: { target: "done" },
      },
    },

    // ─── Done: save trace, close ──────────────────────────────────────────
    done: {
      type: "final",
      entry: [
        emit({ type: "@status", data: `<span class="text-green-400">● done</span> — Complete ✓` }),
        emit({
          type: "@progress",
          data: `<div class="text-sm text-green-400 font-semibold mt-4">✓ All phases complete</div>`,
        }),
      ],
      // TODO: invoke saveTrace on entry (fire-and-forget)
    },

    // ─── Error ────────────────────────────────────────────────────────────
    error: {
      entry: [
        emit(({ context }) => ({
          type: "@status",
          data: `<span class="text-red-400">● error</span> — ${context.error || "Unknown"}`,
        })),
        emit(({ context }) => ({
          type: "@progress",
          data: `<div class="text-xs text-red-400">[${new Date().toLocaleTimeString()}] ✗ ${context.error || "Unknown error"}</div>`,
        })),
      ],
      on: {
        retry: [
          {
            guard: ({ context }) => context.retries < 3,
            target: "connecting",
            actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }),
          },
        ],
        request: {
          target: "connecting",
          actions: assign({
            prompt: ({ event }) => event.prompt || "",
            projectId: ({ event }) => event.projectId || `session-${Date.now()}`,
            error: () => null,
            retries: () => 0,
          }),
        },
      },
    },
  },
});

export default machine;
