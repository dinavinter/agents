/**
 * Kyma Function Handler — Dynamic Agent Runner
 * 
 * Kyma serverless Function (CommonJS) that:
 * 1. On cold start → fetches agent source code (from GitHub or Agents API)
 * 2. Rewrites ESM URL imports (esm.sh) → npm package names
 * 3. Writes temp .mjs → dynamic import() → loads agent module
 * 4. Delegates all incoming requests to the loaded agent handler
 * 5. On /_reload webhook → invalidates cache, next request re-fetches
 * 
 * Each agent = its own Kyma Function. Scale-to-zero. No persistent connections.
 * Agent code uses esm.sh imports — runner rewrites them to npm at load time.
 *
 * Environment variables:
 *   AGENT_ID       = agent identifier
 *   MODE           = "github" | "api"
 *   GITHUB_REPO    = owner/repo                  (mode=github)
 *   GITHUB_PATH    = path/to/handler.mjs         (mode=github)
 *   GITHUB_BRANCH  = main                        (mode=github)
 *   GITHUB_TOKEN   = PAT for private repos       (mode=github, optional)
 *   API_URL        = https://agents-api.example  (mode=api)
 *   CACHE_TTL      = 0                           (ms, 0=forever until reload)
 *   WEBHOOK_SECRET = shared secret for GitHub webhook verification
 */

const { createHash, createHmac } = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

// --- State (in-memory, reset on cold start) ---

let cachedModule = null;
let cachedHandler = null;
let cachedRev = null;
let cachedAt = 0;
let loadError = null;
let yjsProvider = null;
let yjsDoc = null;

// --- Source fetching ---

async function fetchSource() {
  const mode = process.env.MODE || "github";

  if (mode === "github") {
    const repo = process.env.GITHUB_REPO;
    const filePath = process.env.GITHUB_PATH || "handler.mjs";
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

function rewriteImports(src) {
  return src.replace(
    /from\s+["'](https:\/\/esm\.sh\/|https:\/\/esm\.town\/v\/[^"']+\/)([@\w\/-]+)(?:@[^?"']*)?(?:\?[^"']*)?["']/g,
    (match, prefix, pkg) => `from "${pkg}"`
  ).replace(
    /import\s+["'](https:\/\/esm\.sh\/)([@\w\/-]+)(?:@[^?"']*)?(?:\?[^"']*)?["']/g,
    (match, prefix, pkg) => `import "${pkg}"`
  ).replace(
    /import\(["'](https:\/\/esm\.sh\/)([@\w\/-]+)(?:@[^?"']*)?(?:\?[^"']*)?["']\)/g,
    (match, prefix, pkg) => `import("${pkg}")`
  ).replace(
    /from\s+["']jsr:@([^"']+)["']/g,
    (match, pkg) => `from "@${pkg}"`
  );
}

// --- Module loading ---

async function compileAndLoad(src) {
  const rev = createHash("md5").update(src).digest("hex").slice(0, 10);
  const rewritten = rewriteImports(src);

  // Write temp .mjs — Kyma function runs from /usr/src/app/function/
  // Use /tmp which is writable in Kyma containers
  const tmpDir = path.join(os.tmpdir(), "agent-cache");
  await fs.mkdir(tmpDir, { recursive: true });

  // Symlink node_modules so the .mjs can resolve packages
  const nmLink = path.join(tmpDir, "node_modules");
  try {
    await fs.access(nmLink);
  } catch {
    // Kyma puts function deps in /usr/src/app/function/node_modules
    const candidates = [
      path.join(__dirname, "node_modules"),
      path.join(__dirname, "..", "node_modules"),
      "/usr/src/app/function/node_modules",
      "/usr/src/app/node_modules",
      path.join(process.cwd(), "node_modules"),
    ];
    for (const nm of candidates) {
      try {
        await fs.access(nm);
        await fs.symlink(nm, nmLink, "dir");
        console.log(`[runner] Linked node_modules from ${nm}`);
        break;
      } catch { /* try next */ }
    }
  }

  const tmpFile = path.join(tmpDir, `agent-${process.env.AGENT_ID || "default"}-${rev}.mjs`);
  await fs.writeFile(tmpFile, rewritten, "utf-8");

  // Dynamic import — works in Node 22 even from CJS entry point
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
    handler = createMachineHandler(exports.machine);
  }

  return { handler, rev, module: mod };
}

/**
 * Wraps an XState machine in an HTTP handler.
 * If YJS_URL is set, syncs state to Yjs via ServiceController (visible in agents viewer).
 */
function createMachineHandler(machine) {
  let actor = null;
  let serviceActor = null;

  return async function machineHandler(event, context) {
    const req = event.extensions.request;
    const method = req.method;

    if (!actor) {
      try {
        const yjsUrl = process.env.YJS_URL;
        const agentId = process.env.AGENT_ID || "default";

        if (yjsUrl) {
          // Sync mode: connect to Yjs and write state changes → visible in viewer
          const Y = await import("yjs");
          const { HocuspocusProvider } = await import("@hocuspocus/provider");
          const { createActor } = await import("xstate");

          yjsDoc = new Y.Doc({ guid: agentId });
          yjsProvider = new HocuspocusProvider({
            url: yjsUrl,
            name: agentId,
            document: yjsDoc,
          });

          // Wait for sync — must wait for actual synced event
          await new Promise((resolve, reject) => {
            if (yjsProvider.isSynced) return resolve();
            yjsProvider.on("synced", () => resolve());
            yjsProvider.on("authenticationFailed", () => reject(new Error("Yjs auth failed")));
            setTimeout(() => resolve(), 5000); // fallback
          });
          console.log(`[runner] Yjs provider synced for "${agentId}"`);

          // Register in :agents registry
          const agentsDoc = new Y.Doc({ guid: ":agents" });
          const agentsProvider = new HocuspocusProvider({
            url: yjsUrl,
            name: ":agents",
            document: agentsDoc,
          });
          await new Promise((resolve) => {
            if (agentsProvider.isSynced) return resolve();
            agentsProvider.on("synced", () => resolve());
            setTimeout(() => resolve(), 5000);
          });

          const rev = cachedRev || "live";
          agentsDoc.transact(() => {
            agentsDoc.getMap(agentId).set("rev", rev);
            agentsDoc.getMap(agentId).set("timestamp", Date.now());
            agentsDoc.getMap(agentId).set("status", "running");
          });

          // Write source to agent doc
          if (cachedModule) {
            yjsDoc.transact(() => {
              yjsDoc.getMap().set("src", cachedModule.src || "");
              yjsDoc.getMap().set("rev", rev);
              yjsDoc.getMap().set("timestamp", Date.now());
            });
          }

          // Also connect the REVISION doc — this is what the viewer's runtime route reads
          const revDocId = `${agentId}:${rev}`;
          const revDoc = new (Y.default?.Doc || Y.Doc)({ guid: revDocId });
          const revProvider = new HocuspocusProvider({
            url: yjsUrl,
            name: revDocId,
            document: revDoc,
          });
          await new Promise((resolve) => {
            if (revProvider.isSynced) return resolve();
            revProvider.on("synced", () => resolve());
            setTimeout(() => resolve(), 5000);
          });
          console.log(`[runner] Revision doc "${revDocId}" synced`);

          // Write src to revision doc
          revDoc.transact(() => {
            revDoc.getMap().set("src", cachedModule?.src || "");
            revDoc.getMap().set("rev", rev);
            revDoc.getMap().set("status", "running");
            revDoc.getMap().set("timestamp", Date.now());
          });

          // Create actor and sync state on every transition to BOTH docs
          actor = createActor(machine);
          let eventIndex = 0;
          actor.subscribe((snapshot) => {
            const writeState = (doc) => {
              doc.transact(() => {
                const stateMap = doc.getMap("state");
                stateMap.set("value", snapshot.value);
                stateMap.set("status", snapshot.status);

                const contextMap = doc.getMap("context");
                if (snapshot.context && typeof snapshot.context === "object") {
                  Object.entries(snapshot.context).forEach(([k, v]) => {
                    contextMap.set(k, v);
                  });
                }
              });
            };
            writeState(yjsDoc);
            writeState(revDoc);
          });

          // Also forward emitted events to the revision doc's "emitted" array
          actor.on("*", (event) => {
            revDoc.transact(() => {
              const emitted = revDoc.getArray("emitted");
              emitted.push([{
                id: (++eventIndex).toString(),
                type: event.type,
                timestamp: Date.now(),
                ...event,
              }]);
            });
          });

          actor.start();

          console.log(`[runner] Agent "${agentId}" syncing to Yjs at ${yjsUrl}`);
        } else {
          // No Yjs — standalone mode
          const { createActor } = await import("xstate");
          actor = createActor(machine);
          actor.start();
        }
      } catch (err) {
        console.error("[runner] Machine start error:", err);
        return { error: "Failed to start machine", message: err.message };
      }
    }

    if (method === "GET") {
      const snapshot = actor.getSnapshot();
      return { state: snapshot.value, context: snapshot.context, status: snapshot.status };
    }

    if (method === "POST") {
      const machineEvent = event.data;
      if (!machineEvent || !machineEvent.type) {
        return { error: "Event must have a 'type' field" };
      }
      actor.send(machineEvent);
      const snapshot = actor.getSnapshot();
      return { state: snapshot.value, context: snapshot.context, status: snapshot.status, event: machineEvent };
    }

    return { state: actor.getSnapshot().value };
  };
}

async function ensureLoaded() {
  const ttl = parseInt(process.env.CACHE_TTL || "0");
  if (cachedHandler && !loadError) {
    if (ttl === 0 || (Date.now() - cachedAt) < ttl) return;
  }

  const src = await fetchSource();
  const { handler, rev, module: mod } = await compileAndLoad(src);

  if (!handler) {
    throw new Error(
      `Agent module does not export a handler. Expected: export { main }, export { fetch }, export { machine }, or export default function.`
    );
  }

  cachedModule = mod;
  cachedHandler = handler;
  cachedRev = rev;
  cachedAt = Date.now();
  loadError = null;
  console.log(`[runner] Loaded agent "${process.env.AGENT_ID}", rev=${rev}`);
}

function verifyWebhookSignature(body, signature) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

// --- Kyma Function entry point ---

module.exports = {
  main: async function (event, context) {
    const req = event.extensions.request;
    const res = event.extensions.response;
    const method = req.method;
    const reqPath = req.path || req.url;

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

    // Reload
    if (reqPath === "/_reload" && method === "POST") {
      const sig = req.headers["x-hub-signature-256"];
      if (sig && !verifyWebhookSignature(JSON.stringify(event.data), sig)) {
        res.status(401);
        return { error: "Invalid webhook signature" };
      }
      cachedHandler = null; cachedRev = null; cachedAt = 0; loadError = null;
      try {
        await ensureLoaded();
        return { status: "reloaded", rev: cachedRev };
      } catch (err) {
        loadError = err;
        return { status: "reload_failed", error: err.message };
      }
    }

    // Load agent
    try {
      await ensureLoaded();
    } catch (err) {
      loadError = err;
      console.error(`[runner] Failed to load agent:`, err.message);
      res.status(503);
      return { error: "Agent failed to load", message: err.message, agentId: process.env.AGENT_ID };
    }

    // Delegate
    try {
      return await cachedHandler(event, context);
    } catch (err) {
      console.error(`[runner] Agent handler error:`, err);
      res.status(500);
      return { error: "Agent handler error", message: err.message, agentId: process.env.AGENT_ID, rev: cachedRev };
    }
  },
};
