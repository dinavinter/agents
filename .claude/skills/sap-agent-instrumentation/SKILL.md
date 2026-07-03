---
name: sap-agent-instrumentation
description: Advanced OpenTelemetry instrumentation for Application Foundation agents. Use when the user needs custom spans, manual token tracking, or detailed observability beyond basic auto-instrumentation.
---

# Advanced Agent Instrumentation with OpenTelemetry

This skill provides in-depth guidance on instrumenting an Application Foundation agent with OpenTelemetry. Use this for advanced scenarios beyond the basic `auto_instrument()` call included in the agent bootstrap.

> **Note**: Basic instrumentation is already included in agents created with the `appfnd-agent-bootstrap` skill. Use this skill when you need custom spans, manual token tracking, or more advanced observability.

## Overview

The Application Foundation SDK provides automatic observability through OpenTelemetry-compliant tracing. This enables:

- **Automatic LLM call tracing** - Traces LiteLLM, LangChain, Anthropic, and OpenAI calls
- **Token usage tracking** - Records input/output tokens in OpenTelemetry spans
- **Custom spans** - Add business context to operations
- **Metrics collection** - Track AI Core usage for billing and monitoring

## Quick Start

### Step 1: Initialize Auto-Instrumentation

**CRITICAL:** Initialize auto-instrumentation BEFORE importing AI frameworks:

```python
# main.py - Initialize at the very top of your entry point

# Initialize auto-instrumentation before importing AI frameworks
from sap_cloud_sdk.core.telemetry import auto_instrument
auto_instrument()

# Now import AI frameworks
from pydantic_ai import Agent
from pydantic_ai_litellm import LiteLLMModel
# ... rest of imports
```

This automatically traces:
- LiteLLM calls
- LangChain operations
- Anthropic API calls
- OpenAI API calls

### Step 2: Import Telemetry Functions

```python
from sap_cloud_sdk.core.telemetry import (
    record_aicore_metric,
    context_overlay,
    GenAIOperation,
    add_span_attribute
)
```

### Step 3: Record Token Usage

After each LLM call, record token usage for visibility and billing:

```python
def _log_token_usage(self, result) -> None:
    """Record token usage metrics from the agent run result."""
    try:
        usage = result.usage()

        # Log token usage for visibility
        logger.info(
            f"Token Usage - Input: {usage.input_tokens}, "
            f"Output: {usage.output_tokens}, "
            f"Total: {usage.total_tokens}"
        )

        # Record metrics using Application Foundation SDK
        record_aicore_metric(
            model_name=self.model.model_name,
            provider="sap-aicore",
            operation_name="chat",
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens
        )

    except AttributeError:
        logger.warning("Token usage information not available")
    except Exception as e:
        logger.warning(f"Failed to record token metrics: {e}")
```

### Step 4: Add Custom Spans with Context

Wrap LLM operations with custom spans for business context:

```python
async def process_query(self, query: str, context_id: str):
    """Process a query with tracing."""
    
    with context_overlay(
        GenAIOperation.CHAT,
        attributes={
            "context.id": context_id,
            "query.length": len(query),
            "agent.type": "my_agent"
        }
    ):
        result = await self.agent.run(query)
        
        # Add custom attribute with response info
        add_span_attribute("response.length", len(result.output))
        
        # Record token usage with custom attributes
        usage = result.usage()
        record_aicore_metric(
            model_name=self.model.model_name,
            provider="sap-aicore",
            operation_name="chat",
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            custom_attributes={
                "context_id": context_id,
                "query_length": len(query)
            }
        )
        
        return result
```

## Available GenAI Operations

Use these operation types for context overlays:

| Operation | Use Case |
|-----------|----------|
| `GenAIOperation.CHAT` | Chat/conversation operations |
| `GenAIOperation.TEXT_COMPLETION` | Text completion tasks |
| `GenAIOperation.EMBEDDINGS` | Embedding generation |
| `GenAIOperation.RETRIEVAL` | RAG retrieval operations |
| `GenAIOperation.EXECUTE_TOOL` | Tool/function execution |
| `GenAIOperation.CREATE_AGENT` | Agent creation |
| `GenAIOperation.INVOKE_AGENT` | Agent invocation |

## Complete Example

See [Complete Agent Example](references/instrumented-agent-example.md) for a full working implementation.

## Configuration

### Production Environment

In Container Hosting, the OTEL exporter endpoint is automatically injected:

```bash
# Auto-configured by Container Hosting
OTEL_EXPORTER_OTLP_ENDPOINT=https://...
```

### Local Development

For local testing, set the endpoint manually:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
```

Or use a local collector like Jaeger:

```bash
# Start Jaeger with OTLP support
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  jaegertracing/all-in-one:latest

# Set endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
```

## OpenTelemetry Span Attributes

Auto-instrumentation adds these attributes to spans:

| Attribute | Description |
|-----------|-------------|
| `gen_ai.usage.input_tokens` | Number of input tokens |
| `gen_ai.usage.output_tokens` | Number of output tokens |
| `gen_ai.usage.total_tokens` | Total tokens used |
| `gen_ai.request.model` | Model name |
| `gen_ai.system` | AI provider (e.g., "litellm") |

Custom attributes you add:

| Attribute | Description |
|-----------|-------------|
| `context.id` | Conversation/session ID |
| `query.length` | Input query length |
| `response.length` | Response length |
| `agent.type` | Your agent type identifier |

## Best Practices

1. **Initialize Early**: Call `auto_instrument()` before any AI framework imports
2. **Use Context Overlays**: Wrap operations for business context
3. **Track All Calls**: Record token usage for every LLM interaction
4. **Add Meaningful Attributes**: Include IDs and metadata for debugging
5. **Handle Errors**: Wrap telemetry calls in try/except to avoid breaking business logic

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No traces appearing | Ensure `auto_instrument()` is called before AI imports |
| Token usage not recorded | Check that `result.usage()` returns data |
| Missing spans | Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| Local traces not visible | Ensure Jaeger/collector is running |
