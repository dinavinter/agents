/**
 * Kyma Function Handler — Dynamic Agent Runner
 * 
 * This is a Kyma serverless Function that:
 * 1. On cold start → fetches agent source code (from GitHub or Agents API)
 * 2. Resolves ESM imports (https://esm.sh/...) by downloading them
 * 3. Loads the module via dynamic import()
 * 4. Delegates all incoming requests to the loaded agent handler
 * 5. On /_reload webhook → invalidates cache, next request re-fetches
 * 
 * Each agent runs as its own Kyma Function. Scale-to-zero. No persistent connections.
 * 
 * Supports agent code written as ESM with URL imports:
 *   import { setup } from "https://esm.sh/xstate@5.19.0";
 *   import { fromAIEventStream } from "https://esm.sh/@cxai/stream";
 * 
 * Environment variables:
 *   AGENT_ID       = agent identifier
 *   MODE           = "github" | "api"
 *   GITHUB_REPO    = owner/repo                  (mode=github)
 *   GITHUB_PATH    = path/to/handler.js          (mode=github)
 *   GITHUB_BRANCH  = main                        (mode=github)
 *   GITHUB_TOKEN   = PAT for private repos       (mode=github, optional)
 *   API_URL        = https://agents-api.example  (mode=api)
 *   CACHE_TTL      = 0                           (ms, 0=forever until reload)
 *   WEBHOOK_SECRET = shared secret for GitHub webhook signature verification
 */

import { createHash, createHmac } from "crypto";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- State (in-memory, reset on cold start) ---

let cachedModule = null;
let cachedHandler = null;
let cachedRev = null;
let cachedAt = 0;
let loadError = null;

// --- Source fetching ---

async function fetchSource() {
  const mode = process.env.MODE || "github";

  if (mode === "github") {
    const repo = process.env.GITHUB_REPO;
    const filePath = process.env.GITHUB_PATH || "handler.js";
    const branch = process.env.GITHUB_BRANCH || "main";
    const token = process.env.GITHUB_TOKEN;

    if (!repo) throw new Error("GITHUB_REPO is required");

    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;
    const headers = { "User-Agent": "kyma-agent-runner" };
    if (token) headers["Authorization"] = `token ${token}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`GitHub ${resp.status}: ${url}`);
    return await resp.text();
  }

  if (mode === "api") {
    const apiUrl = process.env.API_URL;
    const agentId = process.env.AGENT_ID || "default";

    if (!apiUrl) throw new Error("API_URL is required");

    const resp = await fetch(`${apiUrl}/agents/${agentId}/src`);
    if (!resp.ok) throw new Error(`API ${resp.status}: ${apiUrl}/agents/${agentId}/src`);
    return await resp.text();
  }

  throw new Error(`Unknown MODE: "${mode}". Use "github" or "api".`);
}

// --- ESM URL Import Resolution ---

/**
 * Rewrites ESM URL imports to local npm requires.
 * 
 * Transforms:
 *   import { setup } from "https://esm.sh/xstate@5.19.0"
 *   → import { setup } from "xstate"
 * 
 *   import { foo } from "https://esm.sh/@cxai/stream?target=esnext"
 *   → import { foo } from "@cxai/stream"
 * 
 * The actual packages must be in package.json dependencies.
 * This way the agent code can use esm.sh URLs for dev (Deno),
 * and the runner resolves them to npm packages in production (Kyma/Node).
 */
function rewriteImports(src) {
  // Match: from "https://esm.sh/PACKAGE" or from 'https://esm.sh/PACKAGE'
  // Captures the package name (with optional @scope/ prefix and version)
  return src.replace(
    /from\s+["'](https:\/\/esm\.sh\/|https:\/\/esm\.town\/v\/[^"']+\/)([@\w\/-]+)(?:@[^?"']*)?(?:\?[^"']*)?["']/g,
    (match, prefix, pkg) => {
      // Handle esm.sh package URLs → npm package name
      return `from "${pkg}"`;
    }
  ).replace(
    // Also handle: import "https://esm.sh/..."
    /import\s+["'](https:\/\/esm\.sh\/)([@\w\/-]+)(?:@[^?"']*)?(?:\?[^"']*)?["']/g,
    (match, prefix, pkg) => {
      return `import "${pkg}"`;
    }
  ).replace(
    // Handle: const X = await import("https://esm.sh/...")
    /import\(["'](https:\/\/esm\.sh\/)([@\w\/-]+)(?:@[^?"']*)?(?:\?[^"']*)?["']\)/g,
    (match, prefix, pkg) => {
      return `import("${pkg}")`;
    }
  ).replace(
    // Handle jsr: imports → npm equivalent
    /from\s+["']jsr:@([^"']+)["']/g,
    (match, pkg) => {
      return `from "@${pkg}"`;
    }
  );
}

// --- Module loading ---

async function compileAndLoad(src) {
  const rev = createHash("md5").update(src).digest("hex").slice(0, 10);

  // Rewrite ESM URL imports to npm package names
  const rewritten = rewriteImports(src);

  // Write temp .mjs file in the SAME directory as handler (so node_modules resolves)
  const tmpDir = path.join(__dirname, ".cache");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `agent-${process.env.AGENT_ID || "default"}-${rev}.mjs`);
  await fs.writeFile(tmpFile, rewritten, "utf-8");

  // Dynamic import — Node.js 22 handles ESM natively
  // node_modules resolves relative to the file location → same tree as the runner
  const mod = await import(tmpFile);

  // Extract handler — supports multiple conventions
  let handler = null;
  const exports = mod.default || mod;

  if (typeof exports === "function") {
    handler = exports;
  } else if (typeof exports.main === "function") {
    handler = exports.main;
  } else if (typeof exports.fetch === "function") {
    handler = exports.fetch;
  } else if (typeof exports.handler === "function") {
    handler = exports.handler;
  } else if (typeof exports.machine === "object") {
    // XState machine — wrap it in a handler that exposes machine state
    handler = createMachineHandler(exports.machine);
  }

  return { handler, rev, module: mod };
}

/**
 * Wraps an XState machine in an HTTP handler.
 * Starts the machine on first request, returns state on GET, sends events on POST.
 */
function createMachineHandler(machine) {
  let actor = null;

  return async function machineHandler(event, context) {
    const req = event.extensions.request;
    const method = req.method;
    const reqPath = req.path;

    // Lazy-start the actor
    if (!actor) {
      try {
        const xstate = await import("xstate");
        actor = xstate.createActor(machine);
        actor.start();
      } catch (err) {
        return { error: "Failed to start machine", message: err.message };
      }
    }

    // GET — return current state
    if (method === "GET") {
      const snapshot = actor.getSnapshot();
      return {
        state: snapshot.value,
        context: snapshot.context,
        status: snapshot.status,
      };
    }

    // POST — send event to machine
    if (method === "POST") {
      const machineEvent = event.data;
      if (!machineEvent || !machineEvent.type) {
        return { error: "Event must have a 'type' field" };
      }
      actor.send(machineEvent);
      const snapshot = actor.getSnapshot();
      return {
        state: snapshot.value,
        context: snapshot.context,
        status: snapshot.status,
        event: machineEvent,
      };
    }

    return { state: actor.getSnapshot().value };
  };
}

async function ensureLoaded() {
  const ttl = parseInt(process.env.CACHE_TTL || "0");

  // Return cached if still valid
  if (cachedHandler && !loadError) {
    if (ttl === 0 || (Date.now() - cachedAt) < ttl) {
      return;
    }
  }

  // Fetch and compile
  const src = await fetchSource();
  const { handler, rev, module: mod } = await compileAndLoad(src);

  if (!handler) {
    throw new Error(
      `Agent module does not export a handler. ` +
      `Expected: export { main }, export { fetch }, export { machine }, or export default function.`
    );
  }

  cachedModule = mod;
  cachedHandler = handler;
  cachedRev = rev;
  cachedAt = Date.now();
  loadError = null;

  console.log(`[runner] Loaded agent "${process.env.AGENT_ID}", rev=${rev}`);
}

// --- Webhook verification ---

function verifyWebhookSignature(body, signature) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // No secret configured = skip
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

// --- Kyma Function entry point ---

export async function main(event, context) {
    const req = event.extensions.request;
    const res = event.extensions.response;
    const method = req.method;
    const reqPath = req.path || req.url;

    // --- Built-in endpoints (always available, even before agent loads) ---

    // Health check
    if (reqPath === "/health" || reqPath === "/.well-known/agent.json") {
      return {
        status: loadError ? "error" : cachedHandler ? "running" : "cold",
        agentId: process.env.AGENT_ID,
        rev: cachedRev,
        mode: process.env.MODE || "github",
        error: loadError?.message,
      };
    }

    // Introspection
    if (reqPath === "/_status") {
      return {
        agentId: process.env.AGENT_ID,
        mode: process.env.MODE || "github",
        rev: cachedRev,
        cachedAt: cachedAt ? new Date(cachedAt).toISOString() : null,
        hasHandler: !!cachedHandler,
        error: loadError?.message,
        source: process.env.MODE === "github"
          ? `${process.env.GITHUB_REPO}/${process.env.GITHUB_PATH}@${process.env.GITHUB_BRANCH || "main"}`
          : `${process.env.API_URL}/agents/${process.env.AGENT_ID}/src`,
      };
    }

    // Reload trigger (POST /_reload or GitHub webhook)
    if (reqPath === "/_reload" && method === "POST") {
      // Verify webhook signature if present
      const sig = req.headers["x-hub-signature-256"];
      if (sig) {
        const rawBody = JSON.stringify(event.data);
        if (!verifyWebhookSignature(rawBody, sig)) {
          res.status(401);
          return { error: "Invalid webhook signature" };
        }
      }

      // Invalidate cache
      cachedHandler = null;
      cachedRev = null;
      cachedAt = 0;
      loadError = null;

      // Eagerly reload
      try {
        await ensureLoaded();
        return { status: "reloaded", rev: cachedRev };
      } catch (err) {
        loadError = err;
        return { status: "reload_failed", error: err.message };
      }
    }

    // --- Load agent (on cold start or after cache invalidation) ---

    try {
      await ensureLoaded();
    } catch (err) {
      loadError = err;
      console.error(`[runner] Failed to load agent:`, err.message);
      res.status(503);
      return {
        error: "Agent failed to load",
        message: err.message,
        agentId: process.env.AGENT_ID,
      };
    }

    // --- Delegate to agent handler ---

    try {
      return await cachedHandler(event, context);
    } catch (err) {
      console.error(`[runner] Agent handler error:`, err);
      res.status(500);
      return {
        error: "Agent handler error",
        message: err.message,
        agentId: process.env.AGENT_ID,
        rev: cachedRev,
      };
    }
}

// Kyma Functions also support CommonJS — export both ways
export default { main };
