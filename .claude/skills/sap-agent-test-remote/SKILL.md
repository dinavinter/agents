---
name: sap-agent-test-remote
description: Test a deployed App Foundation agent remotely using the A2A protocol. Use when the user wants to test their agent after deployment, verify the agent is working in the cloud environment, or send messages to a deployed agent.
---

# Testing App Foundation Agent Remotely

Test deployed App Foundation agents using the A2A protocol.

## Prerequisites

- **Deployed agent** - CI/CD pipeline must have completed
- **IAS OAuth credentials** - Client ID and Secret for authentication
- **Agent URL** - From GitHub Actions deployment logs

---

## Workflow Overview

1. Copy and configure credentials in `app/.env.deploy` from template
2. Run the test script with desired command
3. Troubleshoot if needed

**Important:** Guide the user through ALL steps. The goal is to successfully communicate with the deployed agent.

---

## Step 1: Configure Credentials

Check if `app/.env.deploy` exists:

```bash
cat app/.env.deploy 2>/dev/null || echo "NOT_FOUND"
```

**If NOT_FOUND**, copy the template:

```bash
SKILL_PATH=$(find . -type d -name "sap-agent-test-remote" -path "*/skills/*" 2>/dev/null | head -1)
cp "$SKILL_PATH/templates/.env.deploy" app/.env.deploy
```

Then guide the user to fill in:
1. **IAS_OAUTH_URL** - From IAS tenant (e.g., `https://<tenant>.accounts400.ondemand.com/oauth2/token`)
2. **IAS_CLIENT_ID** - From IAS application
3. **IAS_CLIENT_SECRET** - From IAS application
4. **AGENT_URL** - From GitHub Actions deploy logs (e.g., `https://<agent-name>.<cluster>.stage.kyma.ondemand.com`)

**Finding the Agent URL:**
1. Go to GitHub repository > **Actions** tab
2. Select latest successful workflow
3. Expand **deploy-dev** job
4. Find URL in the last lines of deployment output

---

## Step 2: Run Tests

Use `AskUserQuestion` to ask what the user wants to do:

| Command | Description |
|---------|-------------|
| `health` | Check connectivity, OAuth, and agent accessibility |
| `card` | View agent metadata, capabilities, and skills |
| `info` | Full diagnostic (health + card) |
| `"message"` | Send a test message |

```bash
SKILL_PATH=$(find . -type d -name "sap-agent-test-remote" -path "*/skills/*" 2>/dev/null | head -1)
"$SKILL_PATH/scripts/test-agent.sh" [command]
```

---

## Step 3: Follow-up Questions

**After each action**, use `AskUserQuestion` with these options:
- Health check / Agent card / Send message / Done testing

**On failure**, read `references/troubleshooting.md` and offer retry or diagnostics.
