# Troubleshooting

Common issues and solutions when running agents locally.

## AI Core Connection Failed

**Symptoms:**
- Agent starts but fails when processing messages
- LiteLLM errors in logs
- "Failed to connect to AI Core" messages

**Solutions:**
1. Verify all `AICORE_*` environment variables are set correctly
2. Check credentials are valid and haven't expired
3. Ensure you have access to the specified AI Core instance
4. Verify `AICORE_AUTH_URL` and `AICORE_BASE_URL` are correct
5. Check the `AICORE_RESOURCE_GROUP` name is correct

---

## Port Already in Use

**Symptoms:**
- `Address already in use` error when starting agent
- Cannot bind to port 9000

**Solutions:**

**Option 1:** Use a different port
```bash
.venv/bin/python app/main.py --port 5001
```

**Option 2:** Kill the process using the port
```bash
lsof -ti:9000 | xargs kill
```

---

## Module Not Found Errors

**Symptoms:**
- `ModuleNotFoundError` when running the agent
- Import errors for Application Foundation packages

**Solutions:**
1. Ensure you're using the venv's python:
   ```bash
   .venv/bin/python app/main.py --host 0.0.0.0 --port 9000
   ```
2. Verify dependencies were installed with correct index URL
3. Try reinstalling using the install script:
   ```bash
   SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
   bash "$SKILL_PATH/scripts/install_deps.sh"
   ```

---

## LLM Response Errors

**Symptoms:**
- Agent returns errors when processing messages
- Timeout errors
- Model not found errors

**Solutions:**
1. Check terminal logs for specific LiteLLM errors
2. Verify AI Core credentials have access to the specified model
3. Check if the model name in agent configuration is correct
4. Ensure the resource group has the required model deployed

---

## IndexError: list index out of range

**Symptoms:**
- Error occurs during agent initialization
- Related to resource group access

**Solutions:**
1. Verify `AICORE_RESOURCE_GROUP` name is correct
2. Check you have access to the specified resource group
3. List available resource groups using the helper script:
   ```bash
   SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
   .venv/bin/python "$SKILL_PATH/scripts/list_resource_groups.py"
   ```

---

## Docker Build Fails

**Symptoms:**
- Docker build command fails
- Network errors during build

**Solutions:**
1. Check Docker daemon is running:
   ```bash
   docker ps
   ```
2. Verify network connectivity to `int.repositories.cloud.sap`
3. Try rebuilding with `--no-cache`:
   ```bash
   docker build --no-cache -t my-agent .
   ```

---

## Environment Variables Not Loading

**Symptoms:**
- Agent starts but can't find credentials
- "Environment variable not set" errors

**Solutions:**
1. Verify `app/.env.local` exists and has correct format
2. Check for syntax errors in `.env.local` (no spaces around `=`)
3. Ensure you're exporting variables before running:
   ```bash
   export $(grep -v '^#' app/.env.local | xargs)
   ```
4. Use the environment check script:
   ```bash
   SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
   .venv/bin/python "$SKILL_PATH/scripts/check_env.py"
   ```

---

## Debug Mode

For more verbose logging to diagnose issues:

```bash
export LOG_LEVEL=DEBUG
export $(grep -v '^#' app/.env.local | xargs) && .venv/bin/python app/main.py --host 0.0.0.0 --port 9000
```

This will show:
- Incoming requests with HTTP method and path
- LiteLLM model calls and provider information
- Response status codes
- Token usage information
- Detailed error traces

---

## Checking Server Logs

The server logs provide valuable debugging information:

- **Incoming requests:** Shows HTTP method, path, and request details
- **LiteLLM calls:** Shows model name and provider (e.g., `anthropic--claude-4.5-sonnet; provider = sap`)
- **Response codes:** HTTP status codes for each request
- **Token usage:** Input/output tokens for each LLM call
- **Errors:** Stack traces and error messages

Look for patterns in the logs to identify the root cause of issues.