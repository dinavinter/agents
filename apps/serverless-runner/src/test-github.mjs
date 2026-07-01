/**
 * Test that fetches the tictac agent from GitHub (real network call).
 */

import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set env to fetch from real GitHub
process.env.MODE = "github";
process.env.AGENT_ID = "tictac";
process.env.GITHUB_REPO = "dinavinter/agents";
process.env.GITHUB_PATH = "apps/serverless-runner/examples/agent-tictac/handler.mjs";
process.env.GITHUB_BRANCH = "restruct";

// Load handler
const { main } = await import("./handler.mjs");

// Helper
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

console.log("--- Fetching agent from GitHub ---");
const state = await call("GET", "/");
console.log(state);

if (state._status !== 200) {
  console.error("FAILED: could not load agent from GitHub");
  process.exit(1);
}

console.log("\n--- Playing a game ---");
const m1 = await call("POST", "/", { type: "PLAY", index: 0 });
console.log("X plays 0:", m1.context.board);

const m2 = await call("POST", "/", { type: "AI_MOVE" });
console.log("O plays:", m2.context.board);

const m3 = await call("POST", "/", { type: "PLAY", index: 4 });
console.log("X plays 4:", m3.context.board);

const m4 = await call("POST", "/", { type: "AI_MOVE" });
console.log("O plays:", m4.context.board);

const m5 = await call("POST", "/", { type: "PLAY", index: 8 });
console.log("X plays 8:", m5.context.board);

if (m5.context.winner) {
  console.log(`\nWinner: ${m5.context.winner}!`);
} else {
  console.log("\nGame continues...", m5.state);
}

console.log("\n--- Health check ---");
const health = await call("GET", "/health");
console.log(health);

console.log("\nAll tests passed!");
process.exit(0);
