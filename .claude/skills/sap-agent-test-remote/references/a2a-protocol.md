# A2A Protocol Reference

The A2A (Agent-to-Agent) protocol uses JSON-RPC 2.0 for communication.

## Message Format

### Request Structure
```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "unique-request-id",
  "params": {
    "message": {
      "messageId": "unique-message-id",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Your message here"
        }
      ]
    }
  }
}
```

### Response Structure (Success)
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "artifacts": [
      {
        "parts": [
          {
            "kind": "text",
            "text": "Agent's response here"
          }
        ]
      }
    ]
  }
}
```

### Response Structure (Error)
```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

## Key Fields

| Field | Description | Required |
|-------|-------------|----------|
| `jsonrpc` | Always `"2.0"` | Yes |
| `method` | `"message/send"` for sending messages | Yes |
| `id` | Unique request identifier (string) | Yes |
| `params.message.messageId` | Unique message identifier | Yes |
| `params.message.role` | `"user"` for user messages | Yes |
| `params.message.parts` | Array of message parts | Yes |
| `parts[].kind` | Content type (`"text"`, `"file"`, etc.) | Yes |
| `parts[].text` | Text content (when kind is "text") | Conditional |

## Extracting Agent Response

The agent's text response is in:
```
result.artifacts[0].parts[0].text
```

Using jq:
```bash
echo "$RESPONSE" | jq -r '.result.artifacts[0].parts[0].text'
```

## Multi-turn Conversations

For context-aware conversations, include `contextId`:

```json
{
  "jsonrpc": "2.0",
  "method": "message/send",
  "id": "msg-2",
  "params": {
    "message": {
      "messageId": "msg-002",
      "role": "user",
      "contextId": "conversation-123",
      "parts": [{"kind": "text", "text": "Follow-up question"}]
    }
  }
}
```
