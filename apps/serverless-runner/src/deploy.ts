/**
 * Deploy CLI
 * 
 * Deploy an agent as a Kyma serverless Function.
 * 
 * Usage:
 *   # Dynamic runner — fetches code from GitHub on cold start
 *   deno run --allow-all deploy.ts \
 *     --strategy runner \
 *     --agent my-agent \
 *     --github-repo org/agents \
 *     --github-path agents/my-agent/handler.js
 * 
 *   # Git-sourced — Kyma pulls code directly, rebuilds on push
 *   deno run --allow-all deploy.ts \
 *     --strategy git \
 *     --agent my-agent \
 *     --github-repo org/agents \
 *     --github-path agents/my-agent
 * 
 *   # Delete a function
 *   deno run --allow-all deploy.ts --agent my-agent --delete
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { createActor } from "xstate";
import { deployMachine } from "./deploy-machine.ts";

const flags = parseArgs(Deno.args, {
  string: [
    "strategy", "agent", "mode", "namespace",
    "github-repo", "github-path", "github-branch",
    "api-url", "kyma-api",
    "runner-repo", "runner-branch",
  ],
  boolean: ["delete"],
  default: {
    strategy: "runner",
    mode: "github",
    namespace: "default",
    "github-branch": "main",
    "kyma-api": "https://playground-api.c-27b3a58.stage.kyma.ondemand.com",
    "runner-repo": "dinavinter/agents",
    "runner-branch": "main",
  },
});

if (!flags.agent) {
  console.error("Error: --agent is required");
  console.error("\nUsage:");
  console.error("  deno run --allow-all deploy.ts --strategy runner --agent <id> --github-repo <repo> --github-path <path>");
  console.error("  deno run --allow-all deploy.ts --strategy git --agent <id> --github-repo <repo> --github-path <path>");
  console.error("  deno run --allow-all deploy.ts --agent <id> --delete");
  Deno.exit(1);
}

const actor = createActor(deployMachine, {
  input: {
    strategy: flags.strategy as "runner" | "git",
    agentId: flags.agent,
    namespace: flags.namespace,
    kymaApiUrl: flags["kyma-api"],
    runnerRepo: flags["runner-repo"],
    runnerBranch: flags["runner-branch"],
    mode: flags.mode as "github" | "api",
    githubRepo: flags["github-repo"],
    githubPath: flags["github-path"],
    githubBranch: flags["github-branch"],
    apiUrl: flags["api-url"],
  },
});

actor.subscribe((state) => {
  const log = state.context.logs[state.context.logs.length - 1];
  if (log) console.log(`  ${log}`);

  if (state.matches("running")) {
    console.log(`\n✓ Function deployed and running`);
    console.log(`  Agent:    ${state.context.agentId}`);
    console.log(`  Function: ${state.context.functionName}`);
    console.log(`  URL:      ${state.context.url}`);
    console.log(`  Strategy: ${state.context.strategy}`);
    Deno.exit(0);
  }
  if (state.matches("idle") && flags.delete) {
    console.log(`\n✓ Function deleted`);
    Deno.exit(0);
  }
  if (state.matches("error")) {
    console.error(`\n✗ Deployment failed:`, state.context.error);
    Deno.exit(1);
  }
});

actor.start();

if (flags.delete) {
  console.log(`Deleting function for agent "${flags.agent}"...`);
  actor.send({ type: "DELETE" });
} else {
  console.log(`Deploying agent "${flags.agent}" as Kyma Function (strategy: ${flags.strategy})...`);
  actor.send({ type: "DEPLOY" });
}

// Timeout
setTimeout(() => {
  console.error("Timed out after 5 minutes");
  Deno.exit(1);
}, 300_000);
