/**
 * Quick smoke test — loads the tictac agent via the handler and plays a game.
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve the tictac example on a local HTTP server so the handler can fetch it
const agentSrc = await readFile(
  join(__dirname, "../examples/agent-tictac/handler.mjs"),
  "utf-8"
);

const sourceServer = http.createServer((req, res) => {
  // Simulate GET /agents/tictac/src
  res.setHeader("Content-Type", "text/plain");
  res.end(agentSrc);
});

await new Promise((resolve) => sourceServer.listen(9999, resolve));
console.log("[test] Source server on http://localhost:9999");

// Set env vars for the handler
process.env.MODE = "api";
process.env.API_URL = "http://localhost:9999";
process.env.AGENT_ID = "tictac";

// Load handler
const handlerModule = await import("./handler.mjs");
const main = handlerModule.default?.main || handlerModule.main;

// Helper to call the handler
async function call(method, path, data = null) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; } };
  const event = {
    data,
    extensions: {
      request: { method, path, url: path, headers: {} },
      response: res,
    },
  };
  const result = await main(event, { "function-name": "agent-tictac", runtime: "nodejs22" });
  return { ...result, _status: res.statusCode };
}

// --- Test ---

console.log("\n--- Test: Health check ---");
const health = await call("GET", "/health");
console.log(health);

console.log("\n--- Test: Status ---");
const status = await call("GET", "/_status");
console.log(status);

console.log("\n--- Test: Get initial state ---");
const initial = await call("GET", "/");
console.log(initial);

console.log("\n--- Test: Play move (index 4 = center) ---");
const move1 = await call("POST", "/", { type: "PLAY", index: 4 });
console.log(move1);

console.log("\n--- Test: AI move ---");
const move2 = await call("POST", "/", { type: "AI_MOVE" });
console.log(move2);

console.log("\n--- Test: Get state after moves ---");
const state = await call("GET", "/");
console.log(state);

// Cleanup
sourceServer.close();
console.log("\n[test] Done!");
process.exit(0);
