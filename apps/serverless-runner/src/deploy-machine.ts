/**
 * Kyma Function Deployment Machine
 * 
 * XState machine that deploys agent Functions to Kyma.
 * Both strategies deploy Kyma Functions (true serverless, scale-to-zero):
 * 
 * 1. "runner" — Deploys the generic runner function that dynamically
 *    fetches agent code from GitHub/API on cold start.
 * 
 * 2. "git" — Deploys a Kyma Function sourced directly from the agent's
 *    GitHub repo. Kyma rebuilds on git push.
 * 
 * Either way: one Function per agent, scale-to-zero, proper isolation.
 */

import {
  assign,
  fromPromise,
  fromCallback,
  setup,
} from "xstate";

// --- Types ---

export type Strategy = "runner" | "git";

export interface DeployContext {
  strategy: Strategy;
  agentId: string;
  namespace: string;
  kymaApiUrl: string;
  /** For runner strategy: where the runner code lives */
  runnerRepo?: string;
  runnerBranch?: string;
  /** Agent source config */
  mode?: "github" | "api";
  githubRepo?: string;
  githubPath?: string;
  githubBranch?: string;
  apiUrl?: string;
  /** State */
  functionName?: string;
  status?: string;
  url?: string;
  error?: unknown;
  logs: string[];
}

type DeployEvent =
  | { type: "DEPLOY" }
  | { type: "RELOAD" }
  | { type: "DELETE" }
  | { type: "RETRY" }
  | { type: "STATUS_READY"; url: string }
  | { type: "STATUS_FAILED"; reason: string }
  | { type: "ERROR"; error: unknown };

// --- Helpers ---

function buildFunctionSpec(ctx: DeployContext) {
  const functionName = `agent-${ctx.agentId}`;

  if (ctx.strategy === "git") {
    // Direct git-sourced function
    return {
      apiVersion: "serverless.kyma-project.io/v1alpha2",
      kind: "Function",
      metadata: {
        name: functionName,
        namespace: ctx.namespace,
        labels: {
          "app.kubernetes.io/managed-by": "agent-runner",
          "agent-id": ctx.agentId,
        },
      },
      spec: {
        runtime: "nodejs22",
        source: {
          gitRepository: {
            url: `https://github.com/${ctx.githubRepo}.git`,
            baseDir: ctx.githubPath || ".",
            reference: ctx.githubBranch || "main",
          },
        },
        env: [{ name: "AGENT_ID", value: ctx.agentId }],
        scaleConfig: { minReplicas: 0, maxReplicas: 5 },
        resourceConfiguration: {
          function: {
            resources: {
              limits: { cpu: "500m", memory: "256Mi" },
              requests: { cpu: "100m", memory: "128Mi" },
            },
          },
        },
      },
    };
  }

  // Runner strategy: deploy the generic runner, configured to load this agent
  return {
    apiVersion: "serverless.kyma-project.io/v1alpha2",
    kind: "Function",
    metadata: {
      name: functionName,
      namespace: ctx.namespace,
      labels: {
        "app.kubernetes.io/managed-by": "agent-runner",
        "agent-id": ctx.agentId,
      },
    },
    spec: {
      runtime: "nodejs22",
      source: {
        gitRepository: {
          url: `https://github.com/${ctx.runnerRepo || "dinavinter/agents"}.git`,
          baseDir: "apps/serverless-runner",
          reference: ctx.runnerBranch || "main",
        },
      },
      env: [
        { name: "AGENT_ID", value: ctx.agentId },
        { name: "MODE", value: ctx.mode || "github" },
        { name: "GITHUB_REPO", value: ctx.githubRepo || "" },
        { name: "GITHUB_PATH", value: ctx.githubPath || "handler.js" },
        { name: "GITHUB_BRANCH", value: ctx.githubBranch || "main" },
        { name: "API_URL", value: ctx.apiUrl || "" },
      ],
      scaleConfig: { minReplicas: 0, maxReplicas: 5 },
      resourceConfiguration: {
        function: {
          resources: {
            limits: { cpu: "500m", memory: "256Mi" },
            requests: { cpu: "100m", memory: "128Mi" },
          },
        },
      },
    },
  };
}

// --- Actors ---

const applyFunction = fromPromise(async ({ input }: { input: DeployContext }) => {
  const spec = buildFunctionSpec(input);
  const functionName = `agent-${input.agentId}`;
  const ns = input.namespace;
  const baseUrl = `${input.kymaApiUrl}/apis/serverless.kyma-project.io/v1alpha2/namespaces/${ns}/functions`;

  // Try create
  let resp = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  });

  // If exists, patch it
  if (resp.status === 409) {
    resp = await fetch(`${baseUrl}/${functionName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
  }

  if (!resp.ok) {
    throw new Error(`Kyma API ${resp.status}: ${await resp.text()}`);
  }

  return { functionName, spec: await resp.json() };
});

const deleteFunction = fromPromise(async ({ input }: { input: DeployContext }) => {
  const functionName = `agent-${input.agentId}`;
  const url = `${input.kymaApiUrl}/apis/serverless.kyma-project.io/v1alpha2/namespaces/${input.namespace}/functions/${functionName}`;
  const resp = await fetch(url, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Delete failed: ${resp.status}`);
  }
  return { deleted: functionName };
});

const pollReady = fromCallback(({ sendBack, input }: { sendBack: any; input: DeployContext }) => {
  const functionName = `agent-${input.agentId}`;
  const url = `${input.kymaApiUrl}/apis/serverless.kyma-project.io/v1alpha2/namespaces/${input.namespace}/functions/${functionName}`;

  const interval = setInterval(async () => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const fn = await resp.json();
      const conditions = fn?.status?.conditions || [];
      const running = conditions.find(
        (c: any) => c.type === "Running" && c.status === "True"
      );

      if (running) {
        // Derive URL from Kyma convention
        const fnUrl = `https://${functionName}.${input.namespace}.svc.cluster.local`;
        sendBack({ type: "STATUS_READY", url: fnUrl });
      }

      const failed = conditions.find(
        (c: any) => c.type === "Running" && c.status === "False" && c.reason === "Failed"
      );
      if (failed) {
        sendBack({ type: "STATUS_FAILED", reason: failed.message });
      }
    } catch (err) {
      // Ignore transient errors during polling
    }
  }, 5000);

  return () => clearInterval(interval);
});

// --- Machine ---

export const deployMachine = setup({
  types: {
    context: {} as DeployContext,
    events: {} as DeployEvent,
    input: {} as Partial<DeployContext> & { agentId: string; strategy: Strategy },
  },
  actors: { applyFunction, deleteFunction, pollReady },
}).createMachine({
  id: "kymaFunctionDeploy",
  initial: "idle",
  context: ({ input }) => ({
    strategy: input.strategy,
    agentId: input.agentId,
    namespace: input.namespace || "default",
    kymaApiUrl: input.kymaApiUrl || "https://playground-api.c-27b3a58.stage.kyma.ondemand.com",
    runnerRepo: input.runnerRepo,
    runnerBranch: input.runnerBranch,
    mode: input.mode,
    githubRepo: input.githubRepo,
    githubPath: input.githubPath,
    githubBranch: input.githubBranch,
    apiUrl: input.apiUrl,
    logs: [],
  }),
  states: {
    idle: {
      on: {
        DEPLOY: "applying",
        DELETE: "deleting",
      },
    },
    applying: {
      invoke: {
        src: "applyFunction",
        input: ({ context }) => context,
        onDone: {
          target: "pending",
          actions: assign({
            functionName: ({ event }) => event.output.functionName,
            logs: ({ context, event }) => [
              ...context.logs,
              `Applied function: ${event.output.functionName}`,
            ],
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.error,
            logs: ({ context, event }) => [
              ...context.logs,
              `Apply failed: ${(event.error as Error)?.message}`,
            ],
          }),
        },
      },
    },
    pending: {
      invoke: {
        src: "pollReady",
        input: ({ context }) => context,
      },
      on: {
        STATUS_READY: {
          target: "running",
          actions: assign({
            status: "running",
            url: ({ event }) => event.url,
            logs: ({ context, event }) => [...context.logs, `Ready: ${event.url}`],
          }),
        },
        STATUS_FAILED: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.reason,
            logs: ({ context, event }) => [...context.logs, `Failed: ${event.reason}`],
          }),
        },
      },
    },
    running: {
      on: {
        RELOAD: "applying", // Re-apply triggers rebuild
        DELETE: "deleting",
      },
    },
    deleting: {
      invoke: {
        src: "deleteFunction",
        input: ({ context }) => context,
        onDone: {
          target: "idle",
          actions: assign({
            status: "deleted",
            logs: ({ context }) => [...context.logs, "Function deleted"],
          }),
        },
        onError: {
          target: "error",
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },
    error: {
      on: {
        RETRY: "applying",
        DELETE: "deleting",
      },
    },
  },
});
