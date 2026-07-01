# Serverless Agent Runner

Run agents as **Kyma serverless Functions** — one Function per agent, scale-to-zero, isolated.

## Two Strategies

### 1. Git-Sourced (prod)

Kyma Function pulls agent code directly from GitHub. Rebuilds on `git push`.

```
git push → Kyma detects change → rebuilds Function → serves requests
```

Your agent's `handler.js` IS the Kyma Function. No indirection.

### 2. Dynamic Runner (dev)

A generic runner Function deployed from THIS repo. On cold start, it fetches
the agent's source code from GitHub (or the agents API), compiles it in-memory,
and delegates all requests to it.

```
request → cold start → fetch handler.js from GitHub → compile → respond
         (warm)      → use cached handler            → respond
```

Edit your agent code, push to GitHub, and the next invocation (after scale-to-zero
or `POST /_reload`) picks up the new code — no Kyma rebuild required.

## How It Works

```
                    ┌─────────────────────────────────────────────┐
                    │              Kyma Cluster                     │
                    │                                               │
┌──────────┐       │  ┌─────────────────┐    ┌────────────────┐   │
│  GitHub   │──────▶│  │ Kyma Function A │    │ Kyma Function B│   │
│  repo     │       │  │ (agent-alpha)   │    │ (agent-beta)   │   │
└──────────┘       │  └────────┬────────┘    └───────┬────────┘   │
                    │           │                      │            │
                    │     scale-to-zero          scale-to-zero      │
                    └─────────────────────────────────────────────┘

Each agent = its own Kyma Function. Independently scaled. Independently versioned.
```

## Quick Start

### Deploy an agent (git-sourced)

```bash
# Agent code lives at github.com/org/agents in agents/my-agent/
deno task deploy:git -- \
  --agent my-agent \
  --github-repo org/agents \
  --github-path agents/my-agent \
  --github-branch main
```

### Deploy an agent (dynamic runner)

```bash
# Runner loads code from GitHub on cold start
deno task deploy:runner -- \
  --agent my-agent \
  --github-repo org/agents \
  --github-path agents/my-agent/handler.js \
  --github-branch main
```

### Deploy with kubectl directly

```bash
# Fill in variables and apply
export AGENT_ID=my-agent
export GITHUB_REPO=org/agents
export GITHUB_PATH=agents/my-agent
export NAMESPACE=default

envsubst < deploy/function-git.yaml | kubectl apply -f -
```

### Delete

```bash
deno task deploy -- --agent my-agent --delete
```

## Agent Handler Contract

Your agent's `handler.js` must export a Kyma Function handler:

```javascript
module.exports = {
  main: async function(event, context) {
    const req = event.extensions.request;   // Express request
    const res = event.extensions.response;  // Express response
    const body = event.data;                // Parsed body

    // Return a value = JSON response
    return { hello: "world" };
  }
};
```

For the **dynamic runner** mode, your module can also export:

```javascript
// Option A: Kyma-style (preferred)
module.exports = { main(event, context) { ... } };

// Option B: fetch-style
module.exports = { fetch(request) { return new Response(...); } };

// Option C: plain function
module.exports = function(event, context) { ... };
```

## Endpoints

Every deployed function has these built-in routes:

| Path | Method | Description |
|------|--------|-------------|
| `/health` | GET | Health check + status |
| `/.well-known/agent.json` | GET | A2A agent card |
| `/_status` | GET | Runner introspection (dynamic mode) |
| `/_reload` | POST | Force re-fetch code (dynamic mode) |
| `/*` | * | Delegated to agent handler |

## Project Structure

```
apps/serverless-runner/
├── src/
│   ├── handler.js           # Kyma Function entry (the runner)
│   ├── deploy-machine.ts    # XState machine for Kyma deploy
│   └── deploy.ts            # CLI
├── deploy/
│   ├── function-runner.yaml # CRD template: dynamic runner
│   └── function-git.yaml    # CRD template: git-sourced
├── examples/
│   └── agent-hello/         # Example agent handler
├── package.json             # For Kyma Function build
└── deno.json                # CLI tasks
```

## Dev vs Prod Flow

```
                ┌─────────────────────────────────────┐
                │            Development               │
                │                                       │
   IDE/Editor ──▶ Agents API ──▶ Runner Function       │
                │    (or GitHub)   fetches on cold start│
                │                  ~0s code update      │
                └──────────────────┬───────────────────┘
                                   │ promote
                                   ▼
                ┌─────────────────────────────────────┐
                │            Production                │
                │                                       │
   git push ───▶ Kyma Function (git-sourced)           │
                │   rebuilds container (~60-90s)        │
                │   proper isolation + versioning       │
                └─────────────────────────────────────┘
```

## GitHub Webhook (optional)

For faster reloads in dynamic runner mode, configure a GitHub webhook:

1. Go to repo Settings → Webhooks → Add webhook
2. URL: `https://<function-url>/_reload`
3. Content type: `application/json`
4. Events: Push
5. Secret: set `WEBHOOK_SECRET` env var on the Function

Now every push immediately invalidates the cache — the next request loads fresh code.
