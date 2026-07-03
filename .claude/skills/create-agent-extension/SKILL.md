---
name: create-agent-extension
description: Create an agent extension from scratch. Bootstraps agent extensions with extension points and MCP tools for the Agent Extension Editor. Use this skill when you want to create agent extensions (not full agents) that add capabilities to existing agents.
---

# Create Agent Extension Skill

Build agent extensions directly from natural language. Creates project folder, `agent_extension.yaml` configurations, and automatically adds to workspace.

**Supported AI Coding Agents:** Open Code, Cline, Cursor, and GitHub Copilot

## Overview

The leanest way to go from idea to agent extension:
1. User provides a prompt describing the extension they want
2. **Create project folder** at `/home/user/projects/<extension-name>`
3. **Fetch available agents** to get the agent's ordId and description
4. Understand the requirements (what agent to extend, what capabilities to add)
5. Create the `agent_extension.yaml` configuration in the project folder
6. **Register with solution-actions** using type `com.sap.project.agent-extension`
7. **Automatically add to workspace** (update `.code-workspace` file)

**When to use this skill:**
- User wants to extend an existing agent with new capabilities
- Adding MCP tools to an agent via extension points
- Creating agent extensions for SAP agents (Joule, etc.)
- Rapid prototyping of agent extensions
- **Use when the goal is EXTENSION, not creating a full agent**

**When NOT to use this skill:**
- Creating a standalone AI agent from scratch → Use `create-agent`
- Complex agent with its own LangGraph workflow → Use `create-agent`
- When you need full agent infrastructure (A2A protocol, SAP AI Core) → Use `create-agent`

## Prerequisites

### Required
- Solution context with solution ID
- Project name for the extension

### Optional
- **VSCode with Agent Extension Editor** - For visual editing of the configuration
- **MCP Server runtime** - If implementing the tool servers
- **GitHub repository** - For workflow automation

## Workflow

### Complete Workflow

```
User Prompt
    ↓
1. Create Project Structure
    ↓
2. Fetch Available Agents
    ↓
3. Understand the Requirements
    ↓
4. Design the Extension Structure
    ↓
5. Create the Configuration
    ↓
6. Register with Solution Actions
    ↓
7. Update Workspace File
    ↓
8. Test & Verify
```

### Step 1: Create Project Structure

**CRITICAL: Always start by creating the project folder**

```bash
# 1. Create project folder
mkdir -p /home/user/projects/<extension-name>
```

### Step 2: Fetch Available Agents

**IMPORTANT: Always fetch agent information first** to get the correct `ordId` and `description` for the agent to be extended.

#### When User Provides a Specific ordId

If the user provides a specific ordId (e.g., `sap.joule:agent:employee-onboarding:v1`), fetch that specific agent:

```bash
curl --request POST \
  --url "${H2O_URL}/lobby/public/build/core/v1/proxy/ums/graphql" \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "query { ORD__AgentInstances( filters: { ordIdEquals: \"<USER_PROVIDED_ORDID>\" } ) { edges { node { id ordId title description shortDescription version releaseStatus uclSystemInstanceId uclSystemInstance {localTenantId} partOfPackage { title version } systemType { systemNamespace } partOfProducts { edges { node { title } } } exposedApiResources { edges { node { id ordId title apiProtocol } } } integrationDependencies { edges { node { id ordId title mandatory } } } } } } }"
  }'
```

Replace `<USER_PROVIDED_ORDID>` with the actual ordId provided by the user.

#### Default Query (No ordId Provided)

Use this GraphQL query to fetch all extendable agents:

```bash
curl --request POST \
  --url "${H2O_URL}/lobby/public/build/core/v1/proxy/ums/graphql" \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "query { ORD__AgentInstances( filters: { uclSystemInstanceIdIsNull: true systemType: { systemNamespaceEquals: \"extendable-employee-onboarding\" } } ) { edges { node { id ordId title description shortDescription version releaseStatus uclSystemInstanceId uclSystemInstance {localTenantId} partOfPackage { title version } systemType { systemNamespace } partOfProducts { edges { node { title } } } exposedApiResources { edges { node { id ordId title apiProtocol } } } integrationDependencies { edges { node { id ordId title mandatory } } } } } } }"
  }'
```

**Note:** The `H2O_URL` environment variable must be set (e.g., `https://playground.stg10cf.int.applicationstudio.cloud.sap`).

#### Custom Query

If the user provides a dedicated GraphQL query, use that instead of the queries above.

#### Extract Agent Information

From the response, extract:
- **ordId**: The agent's ORD ID (e.g., `sap.joule:agent:employee-onboarding:v1`)
- **title**: Human-readable name
- **description**: Full description of the agent
- **shortDescription**: Brief description of the agent's purpose
- **exposedApiResources**: Available capabilities/APIs (extension points)
- **integrationDependencies**: Required dependencies

**Present the available agents to the user** and let them select which one to extend (unless already specified).

### Step 3: Understand the Requirements

Clarify the extension requirements:

1. **Which agent** is being extended? (use ordId from the metadata response)
2. **What capabilities** should the extension add?
3. **What extension points** are needed?
4. **What MCP tools** should each extension point have?

If the prompt is unclear, ask clarifying questions before proceeding.

### Step 4: Design the Extension Structure

Plan the extension architecture:

```
<extension-name>/
└── agent_extension.yaml    # Extension configuration (YAML format)
```

**Design Guidelines:**

- **Extension Points**: Logical groupings of related capabilities
- **Instructions**: Clear guidance for the agent on when/how to use the extension
- **Tools**: MCP tools that implement the actual functionality

### Step 5: Create the Configuration

Create `agent_extension.yaml` in the project folder:

```yaml
# Agent Extension Configuration
# Generated from agent metadata

agentOrdId: "<ordId-from-metadata-response>"  # Use the ordId from the metadata query
extensionId: "<generate-uuid>"            # Generate a new UUID v4
authIdentifier: "<generate-mock-uuid>"    # Generate a mock UUID v4 (source TBD)

extensionPoints:
  - name: "<extension-point-name>"
    instruction: |
      <detailed instruction for the agent>
      This can be multi-line YAML for better readability.
    tools:
      - ordId: "sap.mcp.<domain>:<tool-name>:v1"
        mcpToolName: "<tool_function_name>"
        mcpUrl: "https://<mcp-server-url>/mcp"
```

**Configuration Guidelines:**

| Field | Format | Example |
|-------|--------|---------|
| agentOrdId | From metadata response | `sap.joule:agent:employee-onboarding:v1` |
| extensionId | UUID v4 | `a1b2c3d4-5678-9abc-def0-123456789abc` |
| authIdentifier | Mock UUID v4 (source TBD) | `b2c3d4e5-6789-abcd-ef01-234567890abc` |
| ordId (tool) | `sap.mcp.<domain>:<tool>:v<version>` | `sap.mcp.hardware:create_ticket:v1` |
| mcpToolName | snake_case function name | `create_hardware_ticket` |
| mcpUrl | HTTPS URL to MCP server | `https://hardware-mcp.example.com/mcp` |

**YAML Benefits:**
- Multi-line instructions are easier to read and write
- Comments can document the configuration
- More human-friendly format for editing

### Step 6: Register with Solution Actions

Call the following command to link the agent extension project into the solution:
```bash
solution-actions project-created -s <solution_id> -p <full path of agent extension project root folder> -t com.sap.project.agent-extension
```

### Step 7: Update Workspace File

**After solution-actions succeeds, update the workspace file**

```bash
# 1. Read current workspace
cat /home/user/.continue/workspaces/<solution-id>.code-workspace

# 2. Update workspace JSON to add new project path
# Add {"path": "/home/user/projects/<extension-name>"} to folders array

# 3. Write updated workspace back
echo '<updated-json>' > /home/user/.continue/workspaces/<solution-id>.code-workspace
```

**Workspace Update Example:**

Before:
```json
{
  "folders": [
    {"path": "/home/user/projects/solution-docs"},
    {"path": "/home/user/projects/main-agent"}
  ],
  "settings": {}
}
```

After:
```json
{
  "folders": [
    {"path": "/home/user/projects/solution-docs"},
    {"path": "/home/user/projects/main-agent"},
    {"path": "/home/user/projects/<extension-name>"}
  ],
  "settings": {}
}
```

### Step 8: Test & Verify

Verify the configuration:

1. **Folder Structure:**
   - Project folder exists at `/home/user/projects/<extension-name>`
   - `agent_extension.yaml` created correctly

2. **Solution Registration:**
   - `solution-actions project-created` completed successfully
   - Project registered with type `com.sap.project.agent-extension`
   - Extension appears in solution's subProjects list

3. **Workspace Updated:**
   - `.code-workspace` file contains new project path
   - Project visible in VS Code explorer

4. **YAML Validation:**
   - Valid YAML syntax in `agent_extension.yaml`
   - All required fields present
   - UUIDs properly formatted
   - agentOrdId matches the one from the metadata response

## What This Skill Does

This skill **DOES**:
- ✅ Fetch available agents to get ordId and description
- ✅ Create project folder structure
- ✅ Generate `agent_extension.yaml` configuration
- ✅ Register project with solution-actions (type: `com.sap.project.agent-extension`)
- ✅ Update workspace file automatically

This skill does **NOT**:
- ❌ Create full standalone agents (use `create-agent` for that)
- ❌ Set up A2A protocol or LangGraph workflows
- ❌ Deploy MCP servers to production

**Rationale:** Agent extensions are lightweight additions to existing agents. Keep the scope focused.

## Comparison with Other Skills

| Skill | What it Creates | Use When |
|-------|-----------------|----------|
| `create-agent-extension` | Extension project + `agent_extension.yaml` | Extending an existing agent |
| `create-agent` | Full Python agent with A2A, LangGraph, AI Core | Building a new standalone agent |
| `sap-agent-bootstrap` | Agent project structure only | Need just the scaffolding |

## Examples

### Example 1: Hardware Provisioning Extension

**Prompt:** "Create an agent extension called 'hardware-extension' for employee onboarding that handles hardware requests"

**Actions:**
1. Fetch available agents:
   ```bash
   curl --request POST \
     --url "${H2O_URL}/lobby/public/build/core/v1/proxy/ums/graphql" \
     --header 'Content-Type: application/json' \
     --data '{"query": "query { ORD__AgentInstances( filters: { uclSystemInstanceIdIsNull: true systemType: { systemNamespaceEquals: \"extendable-employee-onboarding\" } } ) { edges { node { id ordId title shortDescription } } } }"}'
   ```
2. Extract the ordId (e.g., `sap.joule:agent:employee-onboarding:v1`) from response
3. Create `/home/user/projects/hardware-extension/`
4. Create `agent_extension.yaml` with the ordId from the metadata response
5. Register with solution-actions:
   ```bash
   solution-actions project-created \
     -s 15ddbcf5-3c80-4cbf-80ba-b1e1c94940ff \
     -p /home/user/projects/hardware-extension \
     -t com.sap.project.agent-extension
   ```
6. Update workspace file

**Example `agent_extension.yaml`:**
```yaml
agentOrdId: "sap.joule:agent:employee-onboarding:v1"  # From metadata response
extensionId: "a1b2c3d4-5678-9abc-def0-123456789abc"
authIdentifier: "b2c3d4e5-6789-abcd-ef01-234567890abc"  # Mock UUID (source TBD)

extensionPoints:
  - name: "hardware-provisioning"
    instruction: |
      Use this extension point when the user needs to request hardware
      for new employees during the onboarding process.
      Available actions: create ticket, check status, list available hardware.
    tools:
      - ordId: "sap.mcp.hardware:create_ticket:v1"
        mcpToolName: "create_hardware_ticket"
        mcpUrl: "https://hardware-mcp.example.com/mcp"
```

## Troubleshooting

### "solution-actions command failed"

**Solution:**
- Ensure the project folder exists before calling solution-actions
- Verify the solution ID is correct
- Check that the project path is absolute
- Ensure `agent_extension.yaml` exists in the project folder

### "devSpace path is null in registry"

**This is expected behavior:**
- The registry API currently does not persist `devSpace.projectPath` for agent extensions
- The extension is still properly registered with the solution
- The extension appears correctly in the solution's subProjects list
- This does not affect functionality
- The workspace file maintains the correct path for local development

### "Workspace file not found"

**Solution:**
- Ensure solution context is available
- Check `/home/user/.continue/workspaces/<solution-id>.code-workspace` exists
- If not, create it with initial structure

### "Project folder already exists"

**Solution:**
- Ask user if they want to overwrite or use a different name
- Or append a number: `<extension-name>-2`

### "GraphQL query failed"

**Solution:**
- Verify the `H2O_URL` environment variable is set correctly
- Check network connectivity to the endpoint
- Verify the endpoint URL is correct
- If using a custom query, validate the GraphQL syntax
- Fall back to asking the user for the agentOrdId manually

### "Don't know what agent to extend"

**Solution:**
1. First, run the GraphQL query to fetch available agents
2. Present the list of agents (ordId, title, shortDescription) to the user
3. Let the user select which one to extend
4. If the query fails, ask the user directly for the agentOrdId

## Tips for Best Results

1. **Always fetch agents first** - Get the correct ordId before creating the extension
2. **Always create project folder first** - Before any other files
3. **Register with solution-actions immediately** - After creating `agent_extension.yaml`
4. **Update workspace after registration** - So user sees the project right away
5. **Use descriptive names** - `hardware-extension` not `ext1`
6. **Don't worry about devSpace path** - The known API limitation doesn't affect functionality
7. **Use YAML multi-line syntax** - For complex instructions, use `|` for better readability

## Related Skills

- **create-agent** - For creating full standalone AI agents
- **sap-agent-bootstrap** - For scaffolding new agent projects

---

**Remember:** This skill creates the complete project structure, registers it with solution-actions using type `com.sap.project.agent-extension`, and automatically adds it to the workspace. The project folder should only contain the `agent_extension.yaml` file at the root level. Always fetch the agent's ordId first to ensure you're using the correct identifier. This keeps agent extensions lightweight and focused on extending existing agents with new capabilities.
