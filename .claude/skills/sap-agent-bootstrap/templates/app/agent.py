import logging
from dataclasses import dataclass
from typing import AsyncGenerator, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_litellm import ChatLiteLLM
from langgraph.graph import START, MessagesState, StateGraph

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """{{SYSTEM_PROMPT}}"""


@dataclass
class AgentResponse:
    status: Literal["input_required", "completed", "error"]
    message: str


class SampleAgent:
    SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]

    def __init__(self):
        self.llm = ChatLiteLLM(model="sap/anthropic--claude-4.5-sonnet")
        self.graph = self._build_graph()

    def _build_graph(self):
        async def call_model(state: MessagesState):
            response = await self.llm.ainvoke(state["messages"])
            return {"messages": [response]}

        builder = StateGraph(MessagesState)
        builder.add_node("model", call_model)
        builder.add_edge(START, "model")
        return builder.compile()

    async def stream(self, query: str, context_id: str) -> AsyncGenerator[dict, None]:
        yield {"is_task_complete": False, "require_user_input": False, "content": "Processing..."}
        try:
            messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=query)]
            result = await self.graph.ainvoke({"messages": messages})
            response = result["messages"][-1].content
            yield {"is_task_complete": True, "require_user_input": False, "content": response}
        except Exception as e:
            yield {"is_task_complete": True, "require_user_input": False, "content": f"Error: {e}"}

    def invoke(self, query: str, context_id: str) -> AgentResponse:
        import asyncio
        try:
            messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=query)]
            result = asyncio.run(self.graph.ainvoke({"messages": messages}))
            response = result["messages"][-1].content
            return AgentResponse(status="completed", message=response)
        except Exception as e:
            return AgentResponse(status="error", message=f"Error: {e}")