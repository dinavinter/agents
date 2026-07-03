# Troubleshooting Remote Agent Testing

## Common Errors

### 401 Unauthorized

**Symptoms:**
```json
{"error": "Unauthorized", "status": 401}
```

**Causes & Solutions:**
1. **Token expired** - Tokens last ~1 hour. Get a new one.
2. **Wrong credentials** - Verify `IAS_CLIENT_ID` and `IAS_CLIENT_SECRET`
3. **Wrong OAuth URL** - Check `IAS_OAUTH_URL` is correct for your tenant

**Verify credentials:**
```bash
source app/.env.deploy
curl -s -X POST "$IAS_OAUTH_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$IAS_CLIENT_ID&client_secret=$IAS_CLIENT_SECRET" | jq .
```

---

### 404 Not Found

**Symptoms:**
```json
{"error": "Not Found", "status": 404}
```

**Causes & Solutions:**
1. **Wrong agent URL** - Check `AGENT_URL` matches `metadata.name` in `app.yaml`
2. **Deployment not complete** - Wait for CI/CD to finish

**Verify agent URL:**
```bash
# Extract expected name from app.yaml
grep "name:" app.yaml | head -1

# Your AGENT_URL should be: https://<that-name>.<cluster-id>.stage.kyma.ondemand.com
```

---

### Connection Refused / Timeout

**Symptoms:**
```
curl: (7) Failed to connect
curl: (28) Connection timed out
```

**Causes & Solutions:**
1. **Agent not deployed** - Check GitHub Actions workflow
2. **Deployment failed** - Review CI/CD logs for errors
3. **Network issues** - Try from different network/VPN

**Check deployment status:**
1. Go to your GitHub repository
2. Click **Actions** tab
3. Check latest workflow run status
4. Look for errors in the **deploy-dev** job

---

### Token Request Fails

**Symptoms:**
```json
{"error": "invalid_client", "error_description": "..."}
```

**Causes & Solutions:**
1. **Wrong OAuth URL** - Should end with `/oauth2/token`
2. **Invalid client ID** - Copy again from IAS
3. **Invalid client secret** - Regenerate if needed

---

### Empty Response

**Symptoms:**
- Response is empty or `{}`
- Takes very long then returns nothing

**Causes & Solutions:**
1. **Agent starting up** - First request after deploy takes longer. Wait 30s, retry.
2. **Agent crashed** - Check logs in GitHub Actions or cluster
3. **Timeout** - Agent may be processing. Try simpler message.

---

## Verifying Each Component

### 1. Check OAuth URL is accessible
```bash
curl -s -o /dev/null -w "%{http_code}" "$IAS_OAUTH_URL"
# Should return 400 (bad request without credentials) or 200
```

### 2. Check Agent URL is accessible
```bash
curl -s -o /dev/null -w "%{http_code}" "$AGENT_URL/.well-known/agent.json"
# Should return 200 if agent is deployed
```

### 3. Get Agent Card (no auth needed)
```bash
curl -s "$AGENT_URL/.well-known/agent.json" | jq .
# Should return agent metadata
```
