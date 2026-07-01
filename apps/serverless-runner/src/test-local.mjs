/**
 * Local test server — simulates the Kyma Function runtime locally.
 * 
 * Runs the handler.js with a mock Kyma event/context, served via a local HTTP server.
 * 
 * Usage:
 *   node src/test-local.mjs
 * 
 * Then:
 *   curl http://localhost:8080/health
 *   curl http://localhost:8080/_status
 *   curl -X POST http://localhost:8080/ -H "Content-Type: application/json" -d '{"type":"AI_MOVE"}'
 */

import { createServer } from "http";
import { pathToFileURL } from "url";

// Load handler
const handlerModule = await import("./handler.mjs");
const handler = handlerModule.default?.main || handlerModule.main;

if (!handler) {
  console.error("handler.js does not export 'main'");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "8080");

const server = createServer(async (req, res) => {
  // Collect body
  let body = "";
  for await (const chunk of req) body += chunk;

  let data = null;
  try {
    if (body) data = JSON.parse(body);
  } catch {
    data = body;
  }

  // Mock Kyma event/context
  const event = {
    data,
    extensions: {
      request: {
        method: req.method,
        path: new URL(req.url, `http://localhost:${PORT}`).pathname,
        url: req.url,
        headers: req.headers,
      },
      response: {
        status: (code) => { res.statusCode = code; },
      },
    },
  };

  const context = {
    "function-name": `agent-${process.env.AGENT_ID || "test"}`,
    runtime: "nodejs22",
    timeout: 180,
  };

  try {
    const result = await handler(event, context);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result, null, 2));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message, stack: err.stack }));
  }
});

server.listen(PORT, () => {
  console.log(`[test-local] Running on http://localhost:${PORT}`);
  console.log(`[test-local] MODE=${process.env.MODE || "github"} AGENT_ID=${process.env.AGENT_ID || "default"}`);
  console.log(`[test-local] Try:`);
  console.log(`  curl http://localhost:${PORT}/health`);
  console.log(`  curl http://localhost:${PORT}/_status`);
  console.log(`  curl -X POST http://localhost:${PORT}/ -d '{"type":"AI_MOVE"}'`);
});
