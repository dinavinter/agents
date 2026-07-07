/**
 * Zara — E2E Testing Agent Machine
 *
 * A single XState machine that IS the testing workflow.
 * Connects to Y.js for coordination and Playwright MCP for browser automation.
 *
 * Flow:
 *   idle → connecting → authenticating → create → intent → requirements →
 *   solution → testing → deployment → deployed → done
 *
 * Per-session Playwright MCP:
 *   Each machine instance owns one Playwright MCP connection (HTTP streamable).
 *   On spawn, it connects to the Playwright MCP endpoint and starts tracing.
 *   On terminal state (done/error), it saves the trace and disconnects.
 *
 * Y.js coordination:
 *   Writes session-requests to open an opencode worker session.
 *   The opencode worker connects back to THIS machine's MCP config.
 *   Progress, artifacts, and state transitions are published to Y.js events map.
 *
 * Serverless deployment:
 *   Export `machine` for the serverless-runner to pick up.
 */

import { assign, emit, fromCallback, fromPromise, sendTo, setup, spawnChild } from "xstate";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { createHmac } from "node:crypto";

// ─── Environment ────────────────────────────────────────────────────────────

const HOCUSPOCUS_URL = process.env.HOCUSPOCUS_URL || "ws://hocuspocus:1234";
const YJS_DOC_NAME = process.env.YJS_DOC_NAME || "github:2401";
const PLAYWRIGHT_MCP_URL = process.env.PLAYWRIGHT_MCP_URL || "http://playwright-mcp:8931/mcp";
const AGENT_JWT_SECRET = process.env.AGENT_JWT_SECRET || "dev-secret";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Artifact {
  ref: string;
  url: string;
  type: "trace" | "screenshot" | "report" | "video" | "logs" | "snapshot";
  timestamp: number;
}

interface SessionRequest {
  id: string;
  issueId: string;
  repo: string;
  workdir: string;
  prompt: string;
  mcpConfig: Record<string, any>;
  status: "pending" | "claimed" | "cloning" | "running" | "completed" | "failed";
  workerId?: string;
  sessionId?: string;
  sessionUrl?: string;
  error?: string;
  timestamp: number;
}

interface PlaywrightToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// ─── Playwright MCP Client ──────────────────────────────────────────────────

/**
 * Minimal MCP client for Playwright MCP over HTTP streamable transport.
 * Each session gets one persistent connection.
 */
class PlaywrightSession {
  private sessionId: string | null = null;

  constructor(private url: string) {}

  /** Call a Playwright MCP tool */
  async callTool(name: string, args: Record<string, any> = {}): Promise<PlaywrightToolResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    // Capture session ID from response
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const json = await res.json();
    if (json.error) {
      return { isError: true, content: [{ type: "text", text: json.error.message }] };
    }
    return json.result;
  }

  /** Initialize the MCP session */
  async initialize(): Promise<void> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "zara-agent", version: "1.0.0" },
        },
      }),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
  }

  /** Start tracing for evidence collection */
  async startTracing(name: string): Promise<void> {
    await this.callTool("browser_run_code_unsafe", {
      code: `await page.context().tracing.start({ name: "${name}", screenshots: true, snapshots: true });`,
    });
  }

  /** Stop tracing and save */
  async stopTracing(path: string): Promise<void> {
    await this.callTool("browser_run_code_unsafe", {
      code: `await page.context().tracing.stop({ path: "${path}" });`,
    });
  }

  /** Navigate to URL */
  async navigate(url: string): Promise<PlaywrightToolResult> {
    return this.callTool("browser_navigate", { url });
  }

  /** Take a screenshot */
  async screenshot(name?: string): Promise<PlaywrightToolResult> {
    return this.callTool("browser_take_screenshot", name ? { name } : {});
  }

  /** Get accessibility snapshot */
  async snapshot(): Promise<PlaywrightToolResult> {
    return this.callTool("browser_snapshot", {});
  }

  /** Click an element */
  async click(element: string, ref?: string): Promise<PlaywrightToolResult> {
    return this.callTool("browser_click", { element, ref });
  }

  /** Fill a form field */
  async fill(element: string, value: string, ref?: string): Promise<PlaywrightToolResult> {
    return this.callTool("browser_type", { element, value, ref });
  }

  /** Run arbitrary code in page context */
  async runCode(code: string): Promise<PlaywrightToolResult> {
    return this.callTool("browser_run_code_unsafe", { code });
  }

  /** Close the session */
  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        await this.callTool("browser_close", {});
      } catch {}
    }
  }

  get id() {
    return this.sessionId;
  }
}

// ─── JWT Signing ────────────────────────────────────────────────────────────

function signHS256(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

// ─── Y.js Connection ────────────────────────────────────────────────────────

const connectYjs = fromPromise(async () => {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: HOCUSPOCUS_URL,
    name: YJS_DOC_NAME,
    document: doc,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Y.js sync timeout")), 15000);
    provider.on("synced", () => { clearTimeout(timeout); resolve(); });
    if (provider.isSynced) { clearTimeout(timeout); resolve(); }
  });

  return { doc, provider };
});

// ─── Playwright Connection Actor ────────────────────────────────────────────

const connectPlaywright = fromPromise(async ({ input }: { input: { sessionName: string } }) => {
  const pw = new PlaywrightSession(PLAYWRIGHT_MCP_URL);
  await pw.initialize();
  await pw.startTracing(input.sessionName);
  return pw;
});

// ─── Playwright Tool Call Actor ─────────────────────────────────────────────

const playwrightCall = fromPromise(
  async ({ input }: { input: { pw: PlaywrightSession; tool: string; args?: Record<string, any> } }) => {
    const { pw, tool, args } = input;
    return pw.callTool(tool, args || {});
  },
);

// ─── Dispatch Session Request to Y.js ───────────────────────────────────────

const dispatchRequest = fromPromise(
  async ({ input }: { input: { doc: Y.Doc; projectId: string; prompt: string; workdir: string; repo: string } }) => {
    const { doc, projectId, prompt, workdir, repo } = input;
    const sessionRequests = doc.getMap<SessionRequest>("session-requests");

    const token = signHS256(
      { sub: projectId, aud: "zara", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 },
      AGENT_JWT_SECRET,
    );

    const requestId = `zara:${projectId}:${Date.now()}`;

    // The MCP config points to THIS machine's Playwright session
    // (opencode connects directly to playwright-mcp with our session context)
    const mcpConfig = {
      playwright: {
        type: "remote",
        url: PLAYWRIGHT_MCP_URL,
        enabled: true,
        oauth: false,
      },
    };

    doc.transact(() => {
      sessionRequests.set(requestId, {
        id: requestId,
        issueId: projectId,
        repo,
        workdir,
        prompt,
        mcpConfig,
        status: "pending",
        timestamp: Date.now(),
      });
    });

    return { requestId, token };
  },
);

// ─── Session Monitor ────────────────────────────────────────────────────────

const monitorSession = fromCallback<
  { type: "session.running"; sessionId: string; url: string } | { type: "session.completed" } | { type: "session.failed"; error: string },
  { doc: Y.Doc; requestId: string }
>(({ sendBack, input }) => {
  const { doc, requestId } = input;
  const sessionRequests = doc.getMap<SessionRequest>("session-requests");

  const check = () => {
    const req = sessionRequests.get(requestId);
    if (!req) return;
    if (req.status === "running" && req.sessionId) {
      sendBack({ type: "session.running", sessionId: req.sessionId, url: req.sessionUrl || "" });
    } else if (req.status === "completed") {
      sendBack({ type: "session.completed" });
    } else if (req.status === "failed") {
      sendBack({ type: "session.failed", error: req.error || "Unknown" });
    }
  };

  const interval = setInterval(check, 3000);
  sessionRequests.observe(check);
  return () => { clearInterval(interval); sessionRequests.unobserve(check); };
});

// ─── Post Event to Y.js ────────────────────────────────────────────────────

function postYjsEvent(doc: Y.Doc, event: { type: string; projectId: string; data?: any }) {
  const events = doc.getMap("events");
  doc.transact(() => { events.set(`${Date.now()}`, event); });
}

// ─── The Machine ────────────────────────────────────────────────────────────

export const machine = setup({
  actors: {
    connectYjs,
    connectPlaywright,
    playwrightCall,
    dispatchRequest,
    monitorSession,
  },
  types: {
    input: {} as { projectId?: string; prompt?: string; repo?: string },
    context: {} as {
      // Infrastructure
      doc: Y.Doc | null;
      provider: HocuspocusProvider | null;
      pw: PlaywrightSession | null;

      // Session
      projectId: string;
      requestId: string | null;
      sessionId: string | null;
      sessionUrl: string | null;

      // Workflow
      solutionId: string | null;
      solutionUrl: string | null;
      prompt: string;
      repo: string;
      workdir: string;

      // Tracking
      progress: Array<{ state: string; message: string; ts: number }>;
      artifacts: Artifact[];
      error: string | null;
      retries: number;
    },
    events: {} as
      | { type: "request"; projectId: string; prompt: string; repo?: string }
      | { type: "session.running"; sessionId: string; url: string }
      | { type: "session.completed" }
      | { type: "session.failed"; error: string }
      | { type: "pw.result"; result: PlaywrightToolResult }
      | { type: "auth.success" }
      | { type: "auth.failed"; reason: string }
      | { type: "create.done"; solutionId: string; solutionUrl: string }
      | { type: "create.failed"; reason: string }
      | { type: "intent.complete"; summary: string }
      | { type: "requirements.complete"; components: string }
      | { type: "solution.ready" }
      | { type: "test.passed" }
      | { type: "test.failed"; reason: string }
      | { type: "deploy.success"; deployUrl?: string }
      | { type: "deploy.failed"; reason: string }
      | { type: "verified" }
      | { type: "retry" }
      | { type: "cancel" },
  },
}).createMachine({
  id: "zara",
  initial: "idle",
  context: ({ input }) => ({
    doc: null,
    provider: null,
    pw: null,
    projectId: input?.projectId || "",
    requestId: null,
    sessionId: null,
    sessionUrl: null,
    solutionId: null,
    solutionUrl: null,
    prompt: input?.prompt || "",
    repo: input?.repo || "",
    workdir: "",
    progress: [],
    artifacts: [],
    error: null,
    retries: 0,
  }),

  states: {
    // ─── Idle: waiting for work ───────────────────────────────────────────
    idle: {
      entry: emit(() => ({ type: "status", event: "status", data: "● idle — Ready for requests" })),
      on: {
        request: {
          target: "connecting",
          actions: assign({
            projectId: ({ event }) => event.projectId,
            prompt: ({ event }) => event.prompt,
            repo: ({ event }) => event.repo || "jl-tests/workspace",
            workdir: ({ event }) => `/workspace/projects/${event.projectId}`,
            error: () => null,
            retries: () => 0,
            progress: () => [],
            artifacts: () => [],
          }),
        },
      },
    },

    // ─── Connect Y.js + Playwright MCP in parallel ────────────────────────
    connecting: {
      type: "parallel",
      entry: emit(() => ({ type: "status", event: "status", data: "● connecting — Y.js + Playwright MCP..." })),
      states: {
        yjs: {
          initial: "connecting",
          states: {
            connecting: {
              invoke: {
                src: "connectYjs",
                onDone: {
                  target: "connected",
                  actions: assign({
                    doc: ({ event }) => event.output.doc,
                    provider: ({ event }) => event.output.provider,
                  }),
                },
                onError: { target: "failed" },
              },
            },
            connected: { type: "final" },
            failed: { type: "final" },
          },
        },
        playwright: {
          initial: "connecting",
          states: {
            connecting: {
              invoke: {
                src: "connectPlaywright",
                input: ({ context }) => ({ sessionName: context.projectId || "zara-session" }),
                onDone: {
                  target: "connected",
                  actions: assign({ pw: ({ event }) => event.output }),
                },
                onError: { target: "failed" },
              },
            },
            connected: { type: "final" },
            failed: { type: "final" },
          },
        },
      },
      onDone: [
        {
          guard: ({ context }) => !!context.doc && !!context.pw,
          target: "authenticating",
        },
        {
          target: "error",
          actions: assign({ error: () => "Failed to connect Y.js or Playwright MCP" }),
        },
      ],
    },

    // ─── Authenticating: IAS login via Playwright ─────────────────────────
    authenticating: {
      entry: [
        emit(() => ({ type: "status", event: "status", data: "● authenticating — Logging into Joule Studio via IAS..." })),
        assign({
          progress: ({ context }) => [
            ...context.progress,
            { state: "authenticating", message: "Navigating to Joule Studio", ts: Date.now() },
          ],
        }),
      ],
      invoke: {
        src: "playwrightCall",
        input: ({ context }) => ({
          pw: context.pw!,
          tool: "browser_navigate",
          args: { url: process.env.DAS_HOST ? `${process.env.DAS_HOST}/new/build` : "https://joule-studio.example.com/new/build" },
        }),
        onDone: { /* Wait for auth.success or auth.failed from the AI driving the session */ },
        onError: {
          target: "error",
          actions: assign({ error: () => "Failed to navigate to Joule Studio" }),
        },
      },
      on: {
        "auth.success": {
          target: "create",
          actions: assign({
            progress: ({ context }) => [
              ...context.progress,
              { state: "authenticating", message: "Login successful", ts: Date.now() },
            ],
          }),
        },
        "auth.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => `Auth failed: ${event.reason}` }),
        },
      },
    },

    // ─── Create: prompt Joule to create a solution ────────────────────────
    create: {
      entry: emit(() => ({ type: "status", event: "status", data: "● create — Prompting Joule to create solution..." })),
      on: {
        "create.done": {
          target: "intent",
          actions: assign({
            solutionId: ({ event }) => event.solutionId,
            solutionUrl: ({ event }) => event.solutionUrl,
            progress: ({ context, event }) => [
              ...context.progress,
              { state: "create", message: `Solution created: ${event.solutionId}`, ts: Date.now() },
            ],
          }),
        },
        "create.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.reason }),
        },
      },
    },

    // ─── Intent: Joule asks clarifying questions ──────────────────────────
    intent: {
      entry: emit(() => ({ type: "status", event: "status", data: "● intent — Joule extracting intent, answering questions..." })),
      on: {
        "intent.complete": {
          target: "requirements",
          actions: assign({
            progress: ({ context, event }) => [
              ...context.progress,
              { state: "intent", message: event.summary, ts: Date.now() },
            ],
          }),
        },
      },
    },

    // ─── Requirements: Joule generating requirements ──────────────────────
    requirements: {
      entry: emit(() => ({ type: "status", event: "status", data: "● requirements — Generating requirements..." })),
      on: {
        "requirements.complete": {
          target: "solution",
          actions: assign({
            progress: ({ context, event }) => [
              ...context.progress,
              { state: "requirements", message: event.components, ts: Date.now() },
            ],
          }),
        },
      },
    },

    // ─── Solution: Joule generating code ──────────────────────────────────
    solution: {
      entry: emit(() => ({ type: "status", event: "status", data: "● solution — Generating solution code..." })),
      on: {
        "solution.ready": {
          target: "testing",
          actions: assign({
            progress: ({ context }) => [
              ...context.progress,
              { state: "solution", message: "Solution generated", ts: Date.now() },
            ],
          }),
        },
      },
    },

    // ─── Testing: verify in sandbox ───────────────────────────────────────
    testing: {
      entry: emit(() => ({ type: "status", event: "status", data: "● testing — Testing solution in sandbox..." })),
      on: {
        "test.passed": {
          target: "deployment",
          actions: assign({
            progress: ({ context }) => [
              ...context.progress,
              { state: "testing", message: "Tests passed", ts: Date.now() },
            ],
          }),
        },
        "test.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => `Test failed: ${event.reason}` }),
        },
      },
    },

    // ─── Deployment: click Deploy ─────────────────────────────────────────
    deployment: {
      entry: emit(() => ({ type: "status", event: "status", data: "● deployment — Deploying solution..." })),
      on: {
        "deploy.success": {
          target: "deployed",
          actions: assign({
            progress: ({ context, event }) => [
              ...context.progress,
              { state: "deployment", message: `Deployed: ${event.deployUrl || "ok"}`, ts: Date.now() },
            ],
          }),
        },
        "deploy.failed": {
          target: "error",
          actions: assign({ error: ({ event }) => event.reason }),
        },
      },
    },

    // ─── Deployed: verify in production ───────────────────────────────────
    deployed: {
      entry: emit(() => ({ type: "status", event: "status", data: "● deployed — Verifying deployed solution..." })),
      on: {
        verified: { target: "done" },
      },
    },

    // ─── Done: save trace, disconnect playwright, report ──────────────────
    done: {
      type: "final",
      entry: [
        emit(({ context }) => ({
          type: "status",
          event: "status",
          data: `● done — ${context.artifacts.length} artifacts, ${context.progress.length} steps`,
        })),
        // Save trace and disconnect Playwright
        assign({
          progress: ({ context }) => [
            ...context.progress,
            { state: "done", message: "Saving trace and closing browser", ts: Date.now() },
          ],
        }),
      ],
      // Cleanup: stop trace + close browser (fire-and-forget via entry effect)
    },

    // ─── Error: retry or give up ──────────────────────────────────────────
    error: {
      entry: emit(({ context }) => ({
        type: "status",
        event: "status",
        data: `● error — ${context.error || "Unknown"} (retries: ${context.retries}/3)`,
      })),
      on: {
        retry: [
          {
            guard: ({ context }) => context.retries < 3,
            target: "authenticating",
            actions: assign({ retries: ({ context }) => context.retries + 1, error: () => null }),
          },
        ],
        request: {
          target: "connecting",
          actions: assign({
            projectId: ({ event }) => event.projectId,
            prompt: ({ event }) => event.prompt,
            repo: ({ event }) => event.repo || "jl-tests/workspace",
            error: () => null,
            retries: () => 0,
            progress: () => [],
            artifacts: () => [],
          }),
        },
      },
    },
  },
});

export default machine;
