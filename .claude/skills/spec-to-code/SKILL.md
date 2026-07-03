---
name: spec-to-code
description: Intent-Based Development (IBD). Implement code from OpenSpec specification. Keywords - "implement spec", "code from spec", "execute tasks", "tasks.md".
allowed-tools: Bash(openspec:*) Bash(npm:*) Bash(ls:*) Bash(cd:*) Read Write Edit Glob
prerequisites:
  - Requires valid OpenSpec change in openspec/changes/<change-id>/
  - If missing, run prd-to-spec first
---

# Spec to Code Agent Skill

This skill implements code from OpenSpec specifications by systematically executing all tasks defined in the `tasks.md` file. It works with existing OpenSpec changes and ensures all implementation tasks are completed.

## Fast Track Mode
- If the user's request explicitly contains "fast track", skip any interactive steps and auto-proceed. Do not ask any questions and do not seek clarification/clarification.

**Supported AI Coding Agents:** OpenCode, Cline, Cursor, and GitHub Copilot

## Overview

The spec-to-code skill focuses exclusively on the implementation phase of the OpenSpec workflow. It takes an existing, validated OpenSpec specification and implements all the tasks defined in `tasks.md`.

**When to use this skill:**
- User wants to implement/generate code from an existing spec
- User wants to execute tasks from tasks.md
- User asks to "implement the spec" or "generate code from spec"
- Following a completed prd-to-spec workflow

**When NOT to use this skill:**
- User wants to create a spec from a PRD → Use `prd-to-spec` instead
- User wants to generate specifications → Use `prd-to-spec` instead
- User asks to "generate code from a PRD" → Use `prd-to-spec` first, then this skill

## Prerequisites

### Required

One of the following **must** be true:

1. **Option A: After prd-to-spec workflow**
   - The `prd-to-spec` skill has been run successfully
   - A valid OpenSpec change exists in `openspec/changes/<change-id>/`
   - The change has been validated with `openspec validate <change-id>`

2. **Option B: Standalone OpenSpec change**
   - A valid OpenSpec change structure exists in `openspec/changes/<change-id>/`
   - The change has been validated with `openspec validate <change-id>`

### Additional Requirements

- **OpenSpec CLI** - Must be installed and accessible
- **Agent skills** - The `openspec-apply-change` skill must be available

### Validation Before Implementation

Always validate the change before implementing:

```bash
openspec validate <change-id> --strict --no-interactive
```

If validation fails, you must fix the specification before proceeding with implementation.

## Workflow

### Step 1: Verify Prerequisites

Before starting implementation, verify:

1. **Change exists:**
   ```bash
   openspec list
   # Should show your <change-id>
   ```

2. **Change is valid:**
   ```bash
   openspec validate <change-id> --strict --no-interactive
   ```

3. **Tasks file exists:**
   ```bash
   ls openspec/changes/<change-id>/tasks.md
   # Should exist and contain tasks
   ```

### Step 2: Implement All Tasks

**IMPORTANT:** The `openspec-apply-change` skill is an agent skill that contains instructions and workflows, **NOT a bash command or executable script**.

Load the `openspec-apply-change` skill. This skill guides you through implementing all tasks in `tasks.md`. You **must** complete all tasks. 

## What This Skill Does NOT Do

This skill does **NOT** perform the following actions (these are left to the user):

- Create or modify specifications (use `prd-to-spec` for this)
- Commit changes to git
- Push code to remote repositories
- Create pull requests
- Merge branches
- Tag releases

**Rationale:** The user should review all implemented code before committing and sharing it.

## Command Reference

### Verification Commands

| Command | Purpose |
|---------|---------|
| `openspec list` | List all OpenSpec changes |
| `openspec show <change-id>` | Show change details |
| `openspec validate <change-id> --strict` | Validate the change structure |
| `cat openspec/changes/<change-id>/tasks.md` | View implementation tasks |

### Agent Skills

**CRITICAL:** These are agent skills that contain instructions and workflows, **NOT bash commands or executable scripts**.

| Skill Name | Purpose |
|---------|---------|
| `openspec-apply-change` | Implement all tasks from tasks.md - Load this skill with the change ID |

## Relationship with prd-to-spec

This skill is designed to work seamlessly with the `prd-to-spec` skill:

### Full PRD-to-Code Workflow

When a user wants to generate code from a PRD:

1. **First:** Use `prd-to-spec` skill
   - Processes the PRD
   - Generates the specification
   - Creates OpenSpec change structure
   - Validates the spec

2. **Then:** Use `spec-to-code` skill (this skill)
   - Implements the tasks from the generated spec
   - Verifies implementation
   - Completes the code

### Standalone Spec Implementation

When a user has an existing OpenSpec change (created manually or from another source):

1. **Verify** the change structure exists and is valid
2. **Use** `spec-to-code` skill directly to implement tasks

## Troubleshooting

### "OpenSpec change not found"

**Cause:** No change exists with the specified ID

**Solution:**
```bash
# List all changes
openspec list

# Verify the change ID exists
ls openspec/changes/
```

If no changes exist, you need to:
- Run `prd-to-spec` first to create a change from a PRD, or
- Manually create a valid OpenSpec change structure

### "tasks.md not found or empty"

**Cause:** The specification doesn't have implementation tasks defined

**Solution:**
- If you used `prd-to-spec`, re-run the spec generation step
- If using a manual spec, create `tasks.md` with implementation tasks
- Validate the change structure: `openspec validate <change-id> --strict`

### "openspec-apply-change skill not available"

**Cause:** Agent skills haven't been loaded

**Solution:** Instruct the user to run the `setup-workspace.js` script again to load all skills.

### "Validation failed"

**Cause:** The OpenSpec change structure is invalid or incomplete

**Solution:**
```bash
# Run validation with details
openspec validate <change-id> --strict

# Fix reported issues in the spec
# Re-validate before attempting implementation
```

# Next steps
After you have completed the code implementation from the specification, suggest the next step to the user, which is to use the `deployment-descriptor` skill for configuring deployment variables to deploy the agent to production. Remind the user to review the code changes before deployment.

When using the `deployment-descriptor` skill, ensure the following structure is used:
```
solution/
├── solution.yaml              # refs ./agent/asset.yaml
└── agent/
    ├── asset.yaml         # buildPath: ., probes use /.well-known/agent.json
    ├── Dockerfile
    ├── requirements.txt
    └── app/
```

## Reference

- OpenSpec documentation: See the OpenSpec CLI help (`openspec --help`)
- prd-to-spec skill: For creating specs from PRDs
