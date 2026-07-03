---
name: add-decorators-python
description: Add low-code UI decorators to a Python agent. Keywords - "add decorators", "decorators", "low-code", "configurable agent". Makes agent configuration (prompts, models, MCP servers, parameters) editable through the low-code UI.
---

# Add Decorators to Python Agent

Add decorators to a Python agent so its configuration (prompts, models, MCP servers, parameters) can be viewed and edited through a low-code UI.

**Supported AI Coding Agents:** Open Code, Cline, Cursor, and GitHub Copilot

## Overview

This skill adds `sap-python-decorator` decorators to an existing Python agent. Decorators wrap standalone module-level functions that return configuration values. The low-code UI reads these decorators to allow non-developers to edit prompts, models, MCP servers, and parameters without touching code.

**When to use this skill:**
- User wants to make an agent configurable via the low-code UI
- User asks to "add decorators" or "make the agent editable"
- Agent has hardcoded model strings, system prompts, or MCP server URLs

**When NOT to use this skill:**
- Agent is already decorated → Review existing decorators instead
- Agent is not Python-based → This skill is Python-only

## Prerequisites

### Required
- An existing Python agent with hardcoded configuration values

## Available Decorators

All decorators are applied to **standalone module-level functions** (not class methods).

```python
from sap_python_decorator.decorators import (
    prompt_section,
    agent_config,
    agent_model,
    mcp_server,
    exposed_param,
)
```

| Decorator | Purpose | Function Return Type |
|---|---|---|
| `@prompt_section(key, label, description, validation?)` | Editable prompt section | `str` |
| `@agent_config(key, label, description)` | General configuration value | any |
| `@agent_model(key, label, description?)` | Model selection | `str` |
| `@mcp_server(key, label, description)` | MCP server configuration | `dict` |
| `@exposed_param(key, label, description)` | Runtime parameter (default is always `None`) | any |

Parameters:
- `key` — Unique dotted identifier (e.g. `"prompts.system"`, `"config.temperature"`).
- `label` — Human-readable name shown in the UI.
- `description` — Help text shown in the UI. Optional only for `agent_model` (defaults to `""`).
- `validation` — Optional dict for `prompt_section` only. Supports `{"format": "text"|"markdown", "max_length": int}`.

## Workflow

### Step 1: Identify Hardcoded Values

Read the agent source file and identify all hardcoded configuration values:
- Model strings (e.g. `"sap/gpt-4o"`)
- System prompts
- Temperature and other config values
- MCP server URLs and configuration
- Runtime parameters

### Step 2: Add Decorator Imports

Add the import at the top of the agent file:

```python
from sap_python_decorator.decorators import (
    prompt_section,
    agent_config,
    agent_model,
    mcp_server,
    exposed_param,
)
```

### Step 3: Define Decorated Functions

Define decorated functions **BEFORE the agent class**, at module level. Each function returns the default value for that configuration.

```python
# ── Decorated functions BEFORE the class ──

@agent_model(
    key="config.model",
    label="LLM Model",
    description="The language model powering this agent",
)
def get_model_name() -> str:
    return "sap/gpt-4o"


@prompt_section(
    key="prompts.system",
    label="System Prompt",
    description="The full system prompt defining the agent's role and behavior",
    validation={"format": "markdown", "max_length": 5000},
)
def get_system_prompt() -> str:
    return "You are an expert assistant for SAP Application Foundation."


@agent_config(
    key="config.temperature",
    label="Temperature",
    description="Sampling temperature for the language model",
)
def get_temperature() -> float:
    return 0.7


@exposed_param(
    key="params.max_tokens",
    label="Max Tokens",
    description="Maximum tokens in model response",
)
def get_max_tokens():
    return None
```

### Step 4: Replace Hardcoded Values in the Agent Class

The agent class must call the decorated functions — no hardcoded values should remain.

**WRONG — decorator defined but never used:**

```python
class MyAgent:
    def __init__(self):
        self.model = LiteLLMModel("sap/gpt-4o")  # HARDCODED!
        self.agent = Agent(
            model=self.model,
            system_prompt="You are an expert..."  # HARDCODED!
        )
```

**CORRECT — class uses decorated functions:**

```python
class MyAgent:
    def __init__(self):
        self.model = LiteLLMModel(get_model_name())  # from decorator
        self.agent = Agent(
            model=self.model,
            system_prompt=get_system_prompt(),  # from decorator
        )
```

### Step 5: Verify

Run through the checklist:
1. Decorator imports are at the top of the file
2. Decorated functions are defined BEFORE the agent class
3. Every hardcoded model string is replaced with `get_model_name()` call
4. Every hardcoded system prompt is replaced with `get_system_prompt()` call
5. No hardcoded values remain for anything that should be configurable

## What This Skill Does

This skill **DOES**:
- Add decorator imports and decorated functions to the agent file
- Replace hardcoded configuration values with decorator function calls

This skill does **NOT**:
- Deploy the agent (use `deploy-agent` for that)
- Modify the agent's business logic or workflow

**Rationale:** This skill focuses solely on making existing configuration values editable through the low-code UI.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Putting decorators on class methods | Decorators go on **standalone module-level functions**, not class methods |
| Defining decorated functions AFTER the class | Functions must be defined BEFORE the class that uses them |
| Defining decorators but never calling them | The agent class must call `get_model_name()`, `get_system_prompt()`, etc. — not use hardcoded strings |
| Splitting the system prompt into multiple `@prompt_section` decorators | Use ONE `@prompt_section` for the full system prompt. Do not split it into pieces |
| Using the same `key` for two decorators | Each key must be unique across all decorators |
| Importing from wrong path | Use `sap_python_decorator.decorators` — not `lowcode.*` |

## Troubleshooting

### "Decorated functions not detected by UI"

**Cause:** Functions are defined inside a class or after the class definition.

**Solution:** Move all decorated functions to module level, BEFORE the agent class.

### "Hardcoded values still in use"

**Cause:** Decorated functions exist but the agent class still uses literal strings instead of calling them.

**Solution:** Replace every hardcoded value in the agent class with the corresponding decorated function call (e.g. `get_model_name()`, `get_system_prompt()`).
