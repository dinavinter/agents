# Quick Reference

Common commands for running and managing agents locally.

## Python Virtual Environment

First, find the skill path: `SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)`

| Command | Description |
|---------|-------------|
| `bash "$SKILL_PATH/scripts/install_deps.sh"` | Install dependencies (creates venv automatically) |
| `export $(grep -v '^#' app/.env.local \| xargs)` | Load environment variables |
| `.venv/bin/python app/main.py --host 0.0.0.0 --port 9000` | Run the agent |
| `.venv/bin/python app/main.py --port 5001` | Run on different port |
| `lsof -ti:9000 \| xargs kill` | Kill process on port 9000 |

## Docker

| Command | Description |
|---------|-------------|
| `docker build --build-arg ... -t my-agent .` | Build Docker image |
| `docker run -p 9000:9000 --env-file app/.env.local my-agent` | Run agent in Docker |
| `docker run -p 9000:9000 --env-file app/.env.local --name my-agent my-agent` | Run with container name |
| `docker ps` | List running containers |
| `docker logs <container-id>` | View container logs |
| `docker stop <container-id>` | Stop container |
| `docker rm <container-id>` | Remove container |
| `docker stop my-agent && docker rm my-agent` | Stop and remove named container |

## Testing

| Command | Description |
|---------|-------------|
| `curl http://localhost:9000/.well-known/agent.json` | Get agent metadata |
| `curl -X POST http://localhost:9000/ --header 'content-type: application/json' --data '{...}'` | Send message to agent |

## Helper Scripts

Use `$SKILL_PATH` set above (or re-run: `SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)`)

| Command | Description |
|---------|-------------|
| `.venv/bin/python "$SKILL_PATH/scripts/check_env.py"` | Check environment variables |
| `.venv/bin/python "$SKILL_PATH/scripts/list_resource_groups.py"` | List AI Core resource groups |
| `.venv/bin/python "$SKILL_PATH/scripts/test_aicore.py"` | Test AI Core connection |
| `.venv/bin/python "$SKILL_PATH/scripts/test_litellm.py"` | Test LiteLLM integration |



## Debug Mode

Enable verbose logging:

```bash
export LOG_LEVEL=DEBUG
export $(grep -v '^#' app/.env.local | xargs) && .venv/bin/python app/main.py --host 0.0.0.0 --port 9000