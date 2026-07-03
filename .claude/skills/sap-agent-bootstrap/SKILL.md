---
name: sap-agent-bootstrap
description: Boostrap a complete App Foundation agent project. Use when the user wants to create a new AI agent for deployment on SAP App Foundation runtime, or asks to create an agent. Use during only spec generation. Never invoke on its own.
---
# App Foundation Agent Bootstrap

Creates a ready-to-deploy AI agent for SAP App Foundation with A2A protocol, LangGraph, SAP AI Core integration, and GitHub Actions CI/CD.

## Instructions

Follow these 3 phases in order:

### Phase 1: Collect User Input

Use `ask_question` tool if available or a similar tool that can be used to ask questions to the user to gather exactly 2 values BEFORE any file operations:

```
Question 1: "Please enter your agent name (e.g., expense-tracker-agent):"
Question 2: "Please enter your agent description (e.g., 'An AI agent that tracks business expenses'):"
```

**Example interaction:**
- User wants: "Create an agent to help with travel expenses"
- Agent name: `travel-expense-agent`
- Agent description: `An AI agent that helps employees manage and submit travel expenses`

### Phase 2: Copy Templates (Deterministic)

Run the appropriate shell command based on user's OS:

**macOS/Linux:**
```bash
mkdir -p solution/agent/app .github/workflows
SKILL_PATH=$(find . -type d -name "sap-agent-bootstrap" -path "*/.agents/skills/*" 2>/dev/null | head -1)
cp -r "$SKILL_PATH/templates/app/." ./solution/agent/app/
cp "$SKILL_PATH/templates/Dockerfile" ./solution/agent/
cp "$SKILL_PATH/templates/requirements.txt" ./solution/agent/
cp "$SKILL_PATH/templates/README.md" ./
cp "$SKILL_PATH/templates/.gitignore" ./
cp -r "$SKILL_PATH/templates/.github/." ./.github/
```

**Windows PowerShell:**
```powershell
New-Item -ItemType Directory -Force -Path solution/agent/app, .github/workflows
$SkillPath = Get-ChildItem -Path . -Recurse -Directory -Filter "sap-agent-bootstrap" | Where-Object { $_.FullName -like "*.agents*skills*" } | Select-Object -First 1 -ExpandProperty FullName
Get-ChildItem "$SkillPath/templates/app" -Force | Copy-Item -Destination "./solution/agent/app/" -Recurse -Force
Copy-Item "$SkillPath/templates/Dockerfile" -Destination "./solution/agent/"
Copy-Item "$SkillPath/templates/requirements.txt" -Destination "./solution/agent/"
Copy-Item "$SkillPath/templates/README.md" -Destination "./"
Copy-Item "$SkillPath/templates/.gitignore" -Destination "./"
Get-ChildItem "$SkillPath/templates/.github" -Force | Copy-Item -Destination "./.github/" -Recurse -Force
```

### Phase 3: Replace Placeholders (Deterministic)

Use shell commands to replace all placeholders. Derive values from the 2 inputs collected in Phase 1. Refer to "Placeholder Derivation Rules" section for more information

**macOS (sed -i ''):**
```bash
# Replace in README.md
sed -i '' 's/{{AGENT_TITLE}}/<Agent Title>/g' README.md
sed -i '' 's/{{AGENT_DESCRIPTION}}/<agent-description>/g' README.md

# Replace in solution/agent/app/main.py
sed -i '' 's/{{AGENT_ID}}/<agent-name>/g' solution/agent/app/main.py
sed -i '' 's/{{AGENT_NAME}}/<agent-name>/g' solution/agent/app/main.py
sed -i '' 's/{{AGENT_SKILL_DESCRIPTION}}/<agent-description>/g' solution/agent/app/main.py
sed -i '' 's/{{AGENT_CARD_DESCRIPTION}}/<agent-description>/g' solution/agent/app/main.py
sed -i '' 's/{{AGENT_TAGS}}/<tags-list>/g' solution/agent/app/main.py
sed -i '' 's/{{AGENT_EXAMPLES}}/<examples-list>/g' solution/agent/app/main.py

# Replace in solution/agent/app/agent.py
sed -i '' 's/{{SYSTEM_PROMPT}}/<system-prompt>/g' solution/agent/app/agent.py
```

**Linux (sed -i without quotes):**
```bash
sed -i 's/{{AGENT_TITLE}}/<Agent Title>/g' README.md
# ... same pattern as macOS but targeting solution/agent/app/
```

**Windows PowerShell:**
```powershell
# Replace in README.md
(Get-Content README.md) -replace '{{AGENT_TITLE}}','<Agent Title>' | Set-Content README.md
(Get-Content README.md) -replace '{{AGENT_DESCRIPTION}}','<agent-description>' | Set-Content README.md

# Replace in solution/agent/app/main.py
(Get-Content solution/agent/app/main.py) -replace '{{AGENT_ID}}','<agent-name>' | Set-Content solution/agent/app/main.py
(Get-Content solution/agent/app/main.py) -replace '{{AGENT_NAME}}','<agent-name>' | Set-Content solution/agent/app/main.py
(Get-Content solution/agent/app/main.py) -replace '{{AGENT_SKILL_DESCRIPTION}}','<agent-description>' | Set-Content solution/agent/app/main.py
(Get-Content solution/agent/app/main.py) -replace '{{AGENT_CARD_DESCRIPTION}}','<agent-description>' | Set-Content solution/agent/app/main.py
(Get-Content solution/agent/app/main.py) -replace '{{AGENT_TAGS}}','<tags-list>' | Set-Content solution/agent/app/main.py
(Get-Content solution/agent/app/main.py) -replace '{{AGENT_EXAMPLES}}','<examples-list>' | Set-Content solution/agent/app/main.py

# Replace in solution/agent/app/agent.py
(Get-Content solution/agent/app/agent.py) -replace '{{SYSTEM_PROMPT}}','<system-prompt>' | Set-Content solution/agent/app/agent.py
```

After placeholder replacement is complete, use the `add-decorators-python` skill to add decorators to `app/agent.py`.

## Placeholder Derivation Rules

Derive all 10 placeholders from the 2 user inputs:

| Placeholder | Derivation | Example Value |
|-------------|------------|---------------|
| `{{AGENT_NAME}}` | Direct from input | `travel-expense-agent` |
| `{{AGENT_NAMESPACE}}` | Same as AGENT_NAME | `travel-expense-agent` |
| `{{AGENT_ID}}` | Same as AGENT_NAME | `travel-expense-agent` |
| `{{AGENT_TITLE}}` | Title-case: replace `-` with space, capitalize | `Travel Expense Agent` |
| `{{AGENT_TAGS}}` | Split AGENT_NAME by `-` into Python list | `["travel", "expense", "agent"]` |
| `{{AGENT_DESCRIPTION}}` | Direct from input | `An AI agent that helps employees manage and submit travel expenses` |
| `{{AGENT_SKILL_DESCRIPTION}}` | Same as AGENT_DESCRIPTION | `An AI agent that helps employees manage and submit travel expenses` |
| `{{AGENT_CARD_DESCRIPTION}}` | Same as AGENT_DESCRIPTION | `An AI agent that helps employees manage and submit travel expenses` |
| `{{SYSTEM_PROMPT}}` | Template: `You are {AGENT_DESCRIPTION}. Help users with their requests.` | `You are an AI agent that helps employees manage and submit travel expenses. Help users with their requests.` |
| `{{AGENT_EXAMPLES}}` | Generate 2 example prompts based on description | `["Help me submit a travel expense", "What are the expense policies?"]` |

## Project Structure

```
./
├── .github/workflows/dev-ci-cd.yml
├── .gitignore
├── README.md
└── solution/
    ├── solution.yaml
    └── agent/
        ├── asset.yaml         # buildPath: .
        ├── Dockerfile
        ├── requirements.txt
        └── app/
            ├── __init__.py
            ├── main.py
            ├── agent_executor.py
            └── agent.py
```

After bootstrapping, the `deployment-descriptor` skill must also create:
- `solution/solution.yaml` — referencing `./agent/asset.yaml`
- `solution/agent/asset.yaml` — with `buildPath: .` and `/.well-known/agent.json` health probes

## Optional: When using pydantic package in your agent code

Add `pydantic` to `requirements.txt` file, but don't add a package version to avoid conflicts with SAP AI Core's pydantic version.

## Customization

- **Tools**: Extend LangGraph in `agent.py`
- **Skills**: Add `AgentSkill` definitions in `main.py`
- **Model / System Prompt / Decorators**: Use the `add-decorators-python` skill to add decorators to `app/agent.py`

## ⚠️ Important: Dependencies

**Note:** Dependencies listed in `requirements.txt` are NOT installed during the bootstrap process. They will be installed:
- **Locally**: When you run the agent using the `sap-agent-run-local` skill
- **In the cluster**: Automatically during the deployment process via CI/CD pipeline

The bootstrap process only creates the project structure and configuration files. No local Python environment setup is performed at this stage.

## ⚠️ Known Deployment Gotchas

These issues have caused real deployment failures and are proven to break the agent on the platform:

1. **`set_aicore_config()` and `auto_instrument()` must be first** — these must be called at the very top of `main.py`, before any AI framework imports (LangChain, LiteLLM, etc.). The platform SDK hooks into the import process; importing AI frameworks first causes telemetry to be missed or misconfigured.

2. **MCP tool loading via `MultiServerMCPClient` must be async and lazy** — `get_tools()` is async and makes real network calls to MCP servers. It cannot be called from `__init__()` and cannot be made sync. Additionally, `async with MultiServerMCPClient(...)` raises `NotImplementedError` — do not use it as a context manager. The correct pattern is:
   ```python
   async def _load_mcp_tools():
       client = MultiServerMCPClient({...})
       return await client.get_tools()

   async def _get_graph(self):
       if self._graph is None:
           tools = await _load_mcp_tools()
           self._graph = create_react_agent(self.llm, tools=tools)
       return self._graph
   ```
   If MCP tools are loaded in `__init__()`, the HTTP server cannot start before the startup probe fires, causing the container to be killed.

## Next Steps

After presenting all the above information, use `ask_question` tool if available or a similar tool that is used to ask questions to the user with these options:

```
"How would you like to proceed with your agent?"

Options:
1. "🚀 File modification - modify prompts or existing skills"
2. "💻 Run locally - Set up and run the agent on my machine"
3. "📚 Tell me more about the project structure"
```

Based on the user's choice:

- **Option 1 (File Modification)**:
  1. First, ask if the user wants to customize key parts before deploying:
     ```
     "Before proceeding to deployment, would you like to edit any of these key files?"

     Options:
     - "✏️ Edit system prompt (app/agent.py)"
     - "✏️ Edit agent skills/description (app/main.py)"
     - "✏️ Configure deployment variables"
     - "✅ No changes needed - deploy now"
     ```
  2. If user chooses to edit, help them make the changes and ask again.
  3. When user selects "No changes needed - deploy now" or "Configure deployment variables", activate the `deployment-descriptor` skill using `activate_skill` tool. Do NOT just mention the skill - actually load it.

- **Option 2 (Run locally)**: Immediately activate the `sap-agent-run-local` skill using `activate_skill` tool or a similar skill loading tool if available. Do NOT just mention the skill - actually load it.

- **Option 3 (More info)**: Provide detailed explanations about the files and architecture
