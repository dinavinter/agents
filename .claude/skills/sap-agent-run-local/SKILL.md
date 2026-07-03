---
name: sap-agent-run-local
description: Run an App Foundation agent locally for development and testing. Use when the user wants to run, test, or debug their agent on their local machine, needs help setting up the local environment, or wants to verify their agent works before deployment.
---

# Running App Foundation Agent Locally

This skill guides you through running an App Foundation agent locally for development and testing.

## ⚠️ Package Index Policy

All Python packages MUST be installed exclusively from the SAP PyPI proxy:
`https://int.repositories.cloud.sap/artifactory/api/pypi/proxy-3rd-party-pypi/simple`

NEVER use `https://pypi.org/simple` or any other external package index.
NEVER add `--extra-index-url` pointing to PyPI.
If a package is not found in the SAP proxy, report the error — do NOT fall back to PyPI.

The `install_deps.sh` script and virtualenv `pip.conf` enforce this. Do not override or bypass them.

## Prerequisites

Before starting, ensure the user has:
- **Python 3.13+** installed
- **AI Core credentials** (for LLM access)

## Workflow Overview

The complete workflow involves these steps:
1. Check credentials status (ALWAYS START HERE)
2. Choose setup method (Python venv or Docker)
3. Copy and configure credentials in `.env.local` from template
4. Set up the environment
5. Run the agent server
6. Test the agent with curl commands

**Important:** Guide the user through ALL steps. Don't stop after just one step - the goal is to have a running, tested agent.

---

## Step 0: Check Credentials Status (ALWAYS START HERE)

**Before anything else, use `AskUserQuestion` to check credentials:**

```
Question: "Do you have SAP AI Core credentials ready for local development?"

Options:
1. "Yes, I have AI Core credentials ready"
2. "I have some credentials but need help finding others"
3. "No, I need help getting all credentials"
```

**Based on response:**
- **Option 1:** Proceed to Step 1
- **Option 2:** Ask which they have, provide guidance for missing ones
- **Option 3:** Guide them to get credentials:
  - **AI Core:** BTP Subaccount → Service Instances → AI Core → Service Key

**Wait for user confirmation before proceeding.**

---

## Step 1: Choose Setup Method

Ask the user which setup method they prefer:

**Options:**
- "🐳 Docker (Recommended for WSL/Windows)"
- "🐍 Python Virtual Environment (Best for active development)"

After they choose, read the appropriate section from `references/setup-methods.md` and guide them through it.

### When to Read Setup Methods Reference

Read `references/setup-methods.md` to get detailed instructions for:
- Copying the `.env.local` template and filling in credentials
- Setting up Python virtual environment OR Docker
- Installing dependencies
- Running the agent server

The reference file contains complete commands and expected output for both methods.

---

## Step 2: Guide Through Setup

Based on their choice, walk them through:

1. **Copying `app/.env.local` from template**:
   ```bash
   SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
   cp "$SKILL_PATH/templates/.env.local" app/.env.local
   ```
   Then edit with credentials
2. **Setting up the environment** (venv or Docker)
3. **Installing dependencies** (for Python venv) - **ALWAYS use the install script**:
   ```bash
   SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
   bash "$SKILL_PATH/scripts/install_deps.sh"
   ```
   This prevents Ctrl+C interruption issues
4. **Running the agent** - the server will run in the foreground

**Key points to communicate:**
- **Use the install script, not manual pip install** - the script handles everything and prevents interruption errors
- The installation takes 3-5 minutes - wait for the "SUCCESS" message
- The agent server runs in the foreground and keeps the terminal busy
- They'll need to open a NEW terminal for testing
- When they see "Uvicorn running on http://0.0.0.0:9000", the server is ready

---

## Step 3: Test the Agent (MANDATORY - DO NOT SKIP)

Once the server is running, **you MUST run these tests**. Do not complete the skill without testing.

### Test 1: Verify Agent Card
```bash
curl -s http://localhost:9000/.well-known/agent.json
```
**Expected:** JSON with agent name, description, capabilities.

### Test 2: Send Test Message (A2A Protocol)
```bash
curl -s -X POST http://localhost:9000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": "test-1",
    "params": {
      "message": {
        "messageId": "msg-001",
        "role": "user",
        "parts": [{"kind": "text", "text": "Hello! What can you help me with?"}]
      }
    }
  }'
```
**Expected:** Response with `result.status.state: "completed"` and `result.artifacts` containing agent's reply.

### A2A Protocol Requirements
- Endpoint: `http://localhost:9000/` (root, NOT `/messages`)
- **MUST include `messageId`** in the message object
- Message uses `parts` array with `kind` and `text` fields
- Full JSON-RPC 2.0 format with `jsonrpc`, `method`, `id`, `params`

Read `references/testing.md` for multi-turn conversation examples and common mistakes.

---

## Step 4: Troubleshooting (If Needed)

If they encounter issues, read `references/troubleshooting.md` for solutions to common problems:
- Artifactory authentication failures
- AI Core connection issues
- Port conflicts
- Module not found errors
- Environment variable problems

The troubleshooting reference includes symptoms, solutions, and helper scripts.

---

## Quick Reference

For quick command lookups, refer to `references/quick-reference.md` which contains:
- Common commands for Python venv and Docker
- Testing commands
- Helper scripts
- Environment variable template
- Expected server output

---

## Helper Scripts

The skill includes utility scripts in the `scripts/` directory:

- **`install_deps.sh`** - Install Python dependencies. **Always use this instead of manual pip install** - it automatically creates the virtual environment (`.venv`) if it doesn't exist and provides clear progress feedback. Running pip manually can be interrupted by Ctrl+C, losing progress.
- `check_env.py` - Verify environment variables are set correctly
- `list_resource_groups.py` - List available AI Core resource groups
- `test_aicore.py` - Test AI Core connection
- `test_litellm.py` - Test LiteLLM integration

Use these when troubleshooting or verifying configuration.

---

## Communication Guidelines

**Be clear and encouraging:**
- Explain what each step does and why it's needed
- Set expectations (e.g., "This will take a few minutes")
- Confirm success at each step before moving forward
- Use the helper scripts to verify configuration when needed

**Don't assume success:**
- Wait for user confirmation after each command
- Check for error messages in their output
- If something fails, consult the troubleshooting reference

**Complete the full workflow:**
- Don't stop after just setting up - guide them through testing too
- Only use `attempt_completion` after the agent is running AND tested
- Verify they can successfully send messages to the agent

---

## Next Steps

After successfully running and testing locally, inform the user they can:
1. **Make changes** - Edit `app/agent.py` to customize behavior
2. **Test changes** - Restart the agent and test with curl
3. **Deploy** - Push to GitHub to trigger CI/CD deployment
4. **Test remotely** - Use the `sap-agent-test-remote` skill to test the deployed agent

---

## Reference Files Structure

```
sap-agent-run-local/
├── SKILL.md (this file)
├── references/
│   ├── setup-methods.md    - Detailed setup for Python venv and Docker
│   ├── testing.md          - Complete testing commands and examples
│   ├── troubleshooting.md  - Common issues and solutions
│   └── quick-reference.md  - Command cheat sheet
├── templates/
│   └── .env.local          - Template for environment variables (copy to app/)
└── scripts/
    ├── install_deps.sh     - Install dependencies (USE THIS, not manual pip)
    ├── check_env.py        - Verify environment variables
    ├── list_resource_groups.py - List AI Core resource groups
    ├── test_aicore.py      - Test AI Core connection
    └── test_litellm.py     - Test LiteLLM integration
```

Read reference files as needed to provide detailed information without cluttering the main skill instructions.