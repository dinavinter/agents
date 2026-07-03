# Testing Your Agent

Once the agent is running, test it to verify everything works correctly.

**IMPORTANT:** The agent server must remain running in its terminal. Open a NEW terminal window/tab to run these test commands.

## Test 1: Verify Agent is Running

Check the agent card endpoint to verify the agent is responding:

```bash
curl http://localhost:9000/.well-known/agent.json
```

**Expected response:** JSON containing agent metadata including name, description, capabilities, and skills.

Example:
```json
{
  "name": "Sample Agent",
  "description": "A sample AI agent demonstrating Application Foundation Agent capabilities.",
  "capabilities": {"pushNotifications": false, "streaming": true},
  "protocolVersion": "0.3.0",
  "skills": [...]
}
```

---

## Test 2: Send a Test Message

Send a message to the agent using the A2A protocol to verify end-to-end functionality:

```bash
curl --request POST \
  --url http://localhost:9000/ \
  --header 'content-type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "test-1",
  "params": {
    "message": {
      "messageId": "msg-001",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Hello, what can you help me with?"
        }
      ]
    }
  }
}'
```

**Expected response:** JSON containing the agent's response with:
- `result.status.state`: Should be `"completed"`
- `result.artifacts`: Contains the agent's text response
- `result.contextId`: A unique context ID for the conversation
- `result.id`: The task ID

Example successful response:
```json
{
  "id": "test-1",
  "jsonrpc": "2.0",
  "result": {
    "status": {"state": "completed", "timestamp": "..."},
    "artifacts": [{
      "artifactId": "...",
      "name": "agent_result",
      "parts": [{"kind": "text", "text": "Hello! I'm happy to help you with..."}]
    }],
    "contextId": "...",
    "id": "..."
  }
}
```

---

## Test 3: Multi-turn Conversation

To continue a conversation, include the `contextId` from the previous response:

```bash
curl --request POST \
  --url http://localhost:9000/ \
  --header 'content-type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "test-2",
  "params": {
    "message": {
      "messageId": "msg-002",
      "role": "user",
      "parts": [{"kind": "text", "text": "Tell me more about coding assistance."}],
      "contextId": "<contextId-from-previous-response>"
    }
  }
}'
```

Replace `<contextId-from-previous-response>` with the actual contextId from Test 2.

---

---

## Common Mistakes

### ❌ Incorrect: Using `/messages` endpoint
```bash
# This will NOT work - wrong endpoint and format
curl -X POST http://localhost:9000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "role": "user",
      "content": [{"text": "Hello!"}]
    }
  }'
```

### ✅ Correct: Using A2A protocol at root endpoint
```bash
# This is the correct format - A2A protocol
curl --request POST \
  --url http://localhost:9000/ \
  --header 'content-type: application/json' \
  --data '{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "test-1",
  "params": {
    "message": {
      "messageId": "msg-001",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Hello, what can you help me with?"
        }
      ]
    }
  }
}'
```

**Key differences:**
- ✅ Use root endpoint `/` (not `/messages`)
- ✅ Use A2A protocol with `jsonrpc`, `method`, `params`
- ✅ Message parts use `kind` and `text` fields
- ✅ Include `messageId` for tracking

---

## Stopping the Agent

After testing, return to the terminal running the agent server and press **Ctrl+C** to stop it.
