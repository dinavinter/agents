---
name: n8n-workflow
description: |
  Create or edit n8n workflow automations. Use this skill whenever the user wants to build, modify, or manage n8n workflows.
metadata:
  version: "1.0.0"
---

# n8n Workflow Skill

## Steps

1. **Set up project folder**: If a `*-workflow/workflows/` folder already exists, use it. Otherwise create one — derive the name from `intent.md` title or the user's description, kebab-cased with a `-workflow` suffix (e.g. `invoice-approval-monitor-workflow`). Fallback: `n8n-workflow`.
   ```bash
   mkdir -p <project-name>-workflow/workflows
   ```

2. **MANDATORY: Look up nodes via MCP (MUST do this for EVERY node)**: Before writing ANY node in the workflow JSON, you MUST call `search-available-nodes` to find the correct node type and version. This is mandatory - never skip this step.
   - For each node you need, call `search-available-nodes` with a relevant search term
   - Get the exact `type` (e.g., `n8n-nodes-base.scheduleTrigger`, `CUSTOM.approvalTask`) and `typeVersion` from the search results
   - NEVER guess node type names or typeVersion — only use values returned by `search-available-nodes`
   - If the workflow involves **tasks** (approvals, task assignments, task status updates), you MUST search for and use **SAP Task Center** nodes. SEARCH FOR "task center" OR "sap task center" OR "task" IN MCP to find the relevant nodes.

3. **Create the file to the filesystem**: Write workflow files to `<project-name>-workflow/workflows/`. The file **must** use the `.n8n.json` extension (e.g. `my-workflow.n8n.json`). NEVER use MCP to create or update workflows.

4. **Delete workflows**: Use the n8n MCP tool only for deletion from the remote n8n instance.


