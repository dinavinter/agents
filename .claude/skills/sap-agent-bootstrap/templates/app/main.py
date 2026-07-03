# CRITICAL: Initialize telemetry BEFORE importing AI frameworks
from application_foundation.aicore import set_aicore_config
from application_foundation.common.telemetry import auto_instrument

set_aicore_config()
auto_instrument()

import logging
import os

import click
import uvicorn
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from agent_executor import AgentExecutor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "9000"))


@click.command()
@click.option("--host", default=HOST)
@click.option("--port", default=PORT)
def main(host: str, port: int):
    skill = AgentSkill(
        id="{{AGENT_ID}}",
        name="{{AGENT_NAME}}",
        description="{{AGENT_SKILL_DESCRIPTION}}",
        tags={{AGENT_TAGS}},
        examples={{AGENT_EXAMPLES}},
    )
    agent_card = AgentCard(
        name="{{AGENT_NAME}}",
        description="{{AGENT_CARD_DESCRIPTION}}",
        url=os.environ.get("AGENT_PUBLIC_URL", f"http://{host}:{port}/"),
        version="1.0.0",
        defaultInputModes=["text", "text/plain"],
        defaultOutputModes=["text", "text/plain"],
        capabilities=AgentCapabilities(streaming=True, pushNotifications=False),
        skills=[skill],
    )
    server = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=DefaultRequestHandler(
            agent_executor=AgentExecutor(),
            task_store=InMemoryTaskStore(),
        ),
    )
    logger.info(f"Starting A2A server at http://{host}:{port}")
    uvicorn.run(server.build(), host=host, port=port)


if __name__ == "__main__":
    main()