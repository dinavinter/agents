#!/usr/bin/env python3
"""Test LiteLLM configuration for SAP AI Core"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv('app/.env.local')

print("=" * 60)
print("LiteLLM SAP Configuration Test")
print("=" * 60)

# Set AI Core config first
from sap_cloud_sdk.aicore import set_aicore_config
set_aicore_config()

print("\n1. Checking LiteLLM environment variables:")
print("-" * 60)

# Check what environment variables LiteLLM might be using
litellm_vars = {k: v for k, v in os.environ.items() if 'LITELLM' in k or 'SAP' in k or 'AICORE' in k}
for key, value in sorted(litellm_vars.items()):
    if 'SECRET' in key or 'TOKEN' in key or 'PASSWORD' in key:
        print(f"{key}: {value[:20]}...")
    else:
        print(f"{key}: {value}")

print("\n2. Testing LiteLLM model initialization:")
print("-" * 60)

try:
    # Auto-detect framework: try PydanticAI first, fall back to LangChain
    framework = None
    try:
        from pydantic_ai import Agent
        from pydantic_ai_litellm import LiteLLMModel
        framework = "pydantic_ai"
        print("Detected framework: PydanticAI")
    except ImportError:
        from langchain_litellm import ChatLiteLLM
        framework = "langchain"
        print("Detected framework: LangChain")

    if framework == "pydantic_ai":
        print("Creating PydanticAI Agent with LiteLLM model...")
        model = LiteLLMModel("sap/anthropic--claude-4.5-sonnet")
        agent = Agent(model)
        print("✓ PydanticAI Agent created successfully")

        print("\n3. Testing model invocation:")
        print("-" * 60)

        print("Sending test message to model...")
        result = agent.run_sync("Say 'Hello' in one word")
        print(f"✓ Model responded: {result.output}")
    else:
        print("Creating ChatLiteLLM instance...")
        llm = ChatLiteLLM(model="sap/anthropic--claude-4.5-sonnet")
        print("✓ ChatLiteLLM instance created successfully")

        print("\n3. Testing model invocation:")
        print("-" * 60)

        from langchain_core.messages import HumanMessage

        print("Sending test message to model...")
        response = llm.invoke([HumanMessage(content="Say 'Hello' in one word")])
        print(f"✓ Model responded: {response.content}")

    print("\n" + "=" * 60)
    print("✓ All tests passed!")
    print("=" * 60)

except Exception as e:
    print(f"✗ Error: {e}")
    print("\n" + "=" * 60)
    print("Troubleshooting tips:")
    print("=" * 60)
    print("1. Check if the model is deployed in AI Core (run test_aicore.py)")
    print("2. Verify the resource group has access to the model")
    print("3. Ensure the model name matches what's deployed")
    print("4. Check if there are any network/firewall issues")
    import traceback
    traceback.print_exc()
    sys.exit(1)
