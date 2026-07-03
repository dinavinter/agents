---
name: prd-to-spec
description: Intent-Based Development (IBD). Transform PRD to OpenSpec specification. Keywords - "spec from PRD", "specification", "generate spec".
compatibility: Requires Node.js/npm for OpenSpec auto-installation
allowed-tools: Bash(npm:*) Bash(openspec:*) Bash(chmod:*) Bash(ls:*) Bash(cd:*) Read Write Edit Glob
prerequisites:
  - Requires product-requirements-document.md (run product-requirements-document if missing)
  - Skip if valid OpenSpec change already exists in openspec/changes/ → proceed with spec-to-code instead
  - Requires openspec-propose skill (installed by workspace setup)
---

# PRD to Spec Agent Skill

This skill automates the workflow of processing Product Requirements Documents (PRDs) using OpenSpec and generating specifications. It initializes projects based on task type (agent, extension or n8n). **For implementation, use the spec-to-code skill after generating the spec.**

## Fast Track Mode
- If and only if the user's request explicitly contains "fast track", this skill generates the most minimal/essential spec artifacts possible and directly triggers implementation (auto-codegen). 
- **All questions and detailed options are bypassed.**
- The produced document should not exceed 50 lines.
- No confirmation for proceeding to the next skill is asked - just proceed immediately to the spec generation.
- In normal mode (no "fast track"), the full workflow and validations are performed with prompts as per the PRD, spec, and user clarification below.

**Supported AI Coding Agents:** OpenCode, Cline, Cursor, and GitHub Copilot

## Overview

This skill initializes projects based on task type, discovers relevant SAP APIs, and generates specifications from PRDs using OpenSpec.

1. Initializes project with task-specific configuration and stubs
2. Discovers relevant SAP APIs (if solution requires API integration)
3. Generates specs from PRD using OpenSpec
4. **For implementation:** Use the `spec-to-code` skill

## Prerequisites

### Required

- **OpenSpec Skills** - The openspec-propose and openspec-apply-change skills must be installed. These are set up automatically by the workspace setup script.
- **Node.js and npm** - For OpenSpec auto-installation (if not already installed)

**Note:** The setup script will auto-install OpenSpec CLI if not found and verify all requirements.

### Agent Skills

This skill requires two OpenSpec agent skills installed by the workspace setup script:

- `openspec-propose` - Creates a new OpenSpec change and generates all spec artifacts (proposal, design, specs, tasks) in one step. 
- `openspec-apply-change` - Applies specifications to implement code (used by spec-to-code skill). 

**How to use these skills:**
- **DO NOT execute these as bash commands** (e.g., `./openspec-propose` or `bash -c "openspec-propose"`)
- **DO load the skill and perform the actions** it defines using the Skill tool
- These are agent skills that contain instructions and workflows, not executable scripts

### Available Tools

- **ekx_search**: If the solution requires integration with SAP APIs, call `ekx_search` with `mode: "api_discovery"` and the use case as the `query` to discover available APIs, Data Products, and Events from the Business Accelerator Hub, including ORD IDs and spec file download links. Use the `output_file` parameter to save the raw response to a file (e.g., `openspec/changes/<change-id>/api-discovery-results.md`). The tool returns the response in context AND saves it to the file. You must include all links to specifications if provided.

## Workflow

### Step 1: Determine Task Type

**CRITICAL:** Before running setup, you **must** determine the task type.

**Supported task types:**

- `agent` - Pro-Code AI Agent for SAP App Foundation using Agent2Agent (A2A) protocol
- `extension` - Side-by-side extension with CAP and custom UI5
- `n8n-workflow` - n8n workflow automation flow

**How to determine the task type:**

1. Read `product-requirements-document.md` and look for the **Solution Category** field:
   ```
   [AI Agent | BTP Extension | n8n Workflow]
   ```
2. Determine the task type based on the **Solution Category**:
   - AI Agent → `agent`
   - AI Extension → `agent`
   - BTP Extension → `extension`
   - n8n Workflow → `n8n-workflow`
3. If the field is missing or its value does not match any supported task type, ask the user: *"What should be implemented? Please choose: agent, extension or n8n workflow."*

### Step 2: Run Setup

Run the setup script with the task type you determined in Step 1:

```bash
node /path/to/skills/prd-to-spec/scripts/setup.mjs <task_type>
```

**Example:**
```bash
# For an AI agent
node /path/to/skills/prd-to-spec/scripts/setup.mjs agent

# For an extension project
node /path/to/skills/prd-to-spec/scripts/setup.mjs extension

# For an n8n workflow
node /path/to/skills/prd-to-spec/scripts/setup.mjs n8n
```

**What this does:**

1. **Validates task type parameter**
   - Ensures a valid task type is provided (agent, extension or n8n)
   - Exits with error if missing or invalid

2. **Installs OpenSpec**
   - Auto-installs if not found (requires npm)
   - Configures environment and disables telemetry

3. **Initializes project based on task type**
   - Copies task-specific config file to `openspec/config.yaml`
   - Copies project stub files for the selected task type to current directory
   - **Note:** `agent` has no project stub — the `sap-agent-bootstrap` skill (automatically invoked by `create-agent`) provides the project scaffolding instead
   - Creates necessary directory structure

**Expected output:**
- Task type confirmation
- OpenSpec installation status (installed or auto-installed)
- Project initialization progress
- Config file and stub files copy confirmation

### Step 3: API Discovery (Conditional)

**When to run:** If the PRD indicates the solution requires integration with SAP APIs (e.g., references OData services, S/4HANA, Business Accelerator Hub APIs, events, or data products).

**Skip this step** if the solution does not involve SAP API integration.

1. Call `ekx_search` with `mode: "api_discovery"`, a concise description of the API integration needs from the PRD as the `query`, and `output_file: "openspec/changes/<change-id>/api-discovery-results.md"`. The tool saves the raw response to the file automatically while still returning it in context. This guarantees the full response (including any pre-signed S3 download URLs) is persisted as-is.
2. For each API that has a Download Link (pre-signed S3 URL) in the response, fetch the spec file and save the **raw downloaded content as-is** to `openspec/changes/<change-id>/api-specs/` (e.g., `supplier-invoices.json`). Create the directory if needed. Do not summarize or replace the content — always persist the original spec file.
3. For each downloaded spec, do a targeted read to extract only the relevant parts: scan the `paths` or `channels` keys for endpoints matching the use case, then read the associated request/response schemas. Do not read the entire spec end-to-end.

If you are creating an AI Agent, after the discovery, you must run the skill mcp-translation-file for the used APIs (use corresponding ORD ID and links in the above paths, use amazonaws link if provided).
The corresponding mcp-translation.json file must then be copied to `solution/agent/` (co-located with the Dockerfile and asset.yaml), make sure to create a task for that.

### Step 4: Create OpenSpec Change and Generate Specification

**IMPORTANT:** After running the setup script, you **must** ensure that you can access the `openspec-propose` agent skill.

Load the `openspec-propose` skill and follow its instructions to create a new OpenSpec change and generate all artifacts (proposal, design, specs, tasks) in one step, using the PRD as input.

**If Step 4 produced API discovery results:** The generated spec artifacts (design.md, spec.md, tasks.md) must reference the concrete API names, ORD IDs, endpoints/paths, and entity schemas — not just generic descriptions like "query S/4HANA". The design.md must include an **API References** section listing the paths to `api-discovery-results.md` and the raw spec files in `api-specs/`, so the implementation agent can read them when it needs full schema details. You MUST include all links to the specifications if provided, in particular the amazonaws links if returned.

**Change name should:**
- Be descriptive of the feature (e.g., "user-authentication")
- Use lowercase with hyphens
- Avoid special characters

### Step 5: Validate Specification

Validate the generated spec:

```bash
openspec validate <change-id> --strict --no-interactive
```

**Validation checks:**
- Spec structure and format
- Required fields and metadata
- Cross-references and consistency
- Task completeness

## Next Steps

After generating and validating the specification, there are two possibilities for continuing:

1. **Implementation**: If the user explicitly requested implementation or code generation (e.g., with a prompt like 'Please generate spec and code from the PRD'), or wants to execute the tasks defined in tasks.md, then you can proceed with implementation using the `spec-to-code` skill.
2. **Review and Feedback**: If the user did not explicitly request implementation (e.g., with a prompt like 'Please generate a spec from the PRD'), suggest that they review the generated specification and ask if they want to proceed with implementation.


## What the Agent Does NOT Do

The agent does **NOT** perform the following actions (these are left to the user or other skills):

- **Implement code** - Use the `spec-to-code` skill for implementation

**Rationale:** 
- Specification and implementation are separate concerns
- The user should review all generated artifacts before proceeding

## Command Reference

### Setup Commands

| Command | Purpose |
|---------|---------|
| `node /path/to/skills/prd-to-spec/scripts/setup.mjs <task_type>` | Complete setup - validates task type, verifies prerequisites, installs OpenSpec, initializes project |

### Agent Skills (Slash Commands)

**CRITICAL:** These are agent skills that contain instructions and workflows, **NOT bash commands or executable scripts**.

**How to use these skills:**
1. Use the Skill tool to load the skill by name
2. Follow the instructions provided by the loaded skill
3. **DO NOT** execute these as bash commands (e.g., `./openspec-new-change` or `bash -c "openspec-new-change"`)

| Skill Name | Purpose |
|------------|---------|
| `openspec-propose` | Create a new OpenSpec change and generate the spec artifacts in one step - Load this skill with the change name and PRD as input |

**Note:** For implementation, use the `spec-to-code` skill which utilizes the `openspec-apply-change` skill.

### OpenSpec CLI Commands

| Command | Purpose |
|---------|---------|
| `openspec validate <id> --strict` | Validate a change |
| `openspec list` | List active changes |
| `openspec show <item>` | View change or spec details |

## Troubleshooting

For common issues and detailed solutions, see [references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md).

### Quick Fixes

**"Invalid task_type"** - Ensure you provide a valid task type: agent, extension or n8n

**"Missing required OpenSpec skills"** - Run the workspace setup script to install the OpenSpec agent skills

**"Config file not found"** - Ensure the prd-to-spec skill includes the assets/config_files directory with task-type-specific config files

## Reference

- For detailed setup instructions: [references/SETUP.md](references/SETUP.md)
