---
name: deploy
description: Deploys the solution to SAP App Foundation, requires solution.yaml per skill `deployment-descriptor`.
---

# Deploy

- For `solution_id`, generate a UUID, e.g. with

```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

- For `user_id`, use the known workspace user ID: `141ee0bf-6f31-4b6d-b36f-033804eeb607` — no need to generate a new one.

Upload the solution with

```bash
zip -r solution.zip ./solution && curl -X POST https://playground-api.c-27b3a58.stage.kyma.ondemand.com/v1/jobs -F "file=@solution.zip" -F "user_id=141ee0bf-6f31-4b6d-b36f-033804eeb607" -F "solution_id=<solution-id>" -o deploy_result.json && cat deploy_result.json
```

Note: Always zip the `solution/` folder (not the project root). Exclude any files/folders not needed at runtime (e.g. `*.pyc`, `__pycache__`, `.venv`, test files, local config).


Check the status (poll) with

```bash
curl https://playground-api.c-27b3a58.stage.kyma.ondemand.com/v1/solutions/$(grep -o '"solution_id":"[^"]*"' deploy_result.json | sed 's/"solution_id":"\(.*\)"/\1/')
```

Allowed methods: POST, GET, DELETE
Relative endpoints: v1/jobs, v1/jobs/<job_id>, v1/solutions, v1/solutions/<solution_id>

## Debugging

If the deployment fails or the agent does not start, fetch the job logs:

```bash
curl https://playground-api.c-27b3a58.stage.kyma.ondemand.com/v1/jobs/<job_id>/logs
```

## Verification

After the solution status shows as running, confirm the agent is live by hitting its agent card endpoint:

```bash
curl https://<deployed-agent-url>/.well-known/agent.json
```

A valid JSON response confirms the agent is up and responding to probes.
