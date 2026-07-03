#!/bin/bash
# ===========================================
# App Foundation Agent Remote Test Script
# ===========================================
# Tests a deployed agent using the A2A protocol.
#
# Usage:
#   ./test-agent.sh [command] [args]
#
# Commands:
#   message [text]  - Send a message (default command)
#   card            - Get agent card (/.well-known/agent.json)
#   health          - Check agent health/accessibility
#   info            - Show all agent information
#   chat            - Interactive chat mode
#
# Exit Codes:
#   0 - Success
#   1 - Agent unreachable
#   2 - OAuth token failed
#   3 - Authentication rejected (401)
#   4 - Endpoint not found (404)
#   5 - Access forbidden (403)
#   6 - Unexpected HTTP response
#   7 - Missing credentials file
#   8 - Missing required variables
#   9 - Message send failed
#
# Reads credentials from app/.env.deploy
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate up to find project root (works with any skills directory structure)
PROJECT_ROOT="$SCRIPT_DIR"
while [[ ! -f "$PROJECT_ROOT/app/.env.deploy" && ! -f "$PROJECT_ROOT/requirements.txt" && "$PROJECT_ROOT" != "/" ]]; do
    PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global status tracking
HEALTH_STATUS=0
CARD_HTTP_CODE=""
ROOT_HTTP_CODE=""
TOKEN_OK=false
AUTH_HTTP_CODE=""

# Load credentials
load_credentials() {
  ENV_FILE="$PROJECT_ROOT/app/.env.deploy"
  if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
  else
    echo -e "${RED}ERROR: $ENV_FILE not found${NC}"
    echo "Copy the template from your skills directory to app/.env.deploy"
    exit 7
  fi
}

# Validate required variables
validate_credentials() {
  MISSING=()
  [ -z "$IAS_OAUTH_URL" ] && MISSING+=("IAS_OAUTH_URL")
  [ -z "$IAS_CLIENT_ID" ] && MISSING+=("IAS_CLIENT_ID")
  [ -z "$IAS_CLIENT_SECRET" ] && MISSING+=("IAS_CLIENT_SECRET")
  [ -z "$AGENT_URL" ] && MISSING+=("AGENT_URL")

  if [ ${#MISSING[@]} -ne 0 ]; then
    echo -e "${RED}ERROR: Missing required variables in app/.env.deploy:${NC}"
    printf '  - %s\n' "${MISSING[@]}"
    exit 8
  fi

  # Normalize AGENT_URL (remove trailing slash)
  AGENT_URL="${AGENT_URL%/}"
}

# Get OAuth token
get_token() {
  TOKEN=$(curl -s -X POST "$IAS_OAUTH_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$IAS_CLIENT_ID&client_secret=$IAS_CLIENT_SECRET" \
    | jq -r '.access_token')

  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo -e "${RED}ERROR: Failed to get OAuth token. Check IAS credentials.${NC}"
    exit 2
  fi
  echo "$TOKEN"
}

# ===========================================
# Command: card - Get Agent Card
# ===========================================
cmd_card() {
  echo -e "${BLUE}=========================================="
  echo "Agent Card"
  echo -e "==========================================${NC}"
  echo "URL: $AGENT_URL/.well-known/agent.json"
  echo ""

  RESPONSE=$(curl -s "$AGENT_URL/.well-known/agent.json")
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AGENT_URL/.well-known/agent.json")

  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}STATUS: SUCCESS (HTTP 200)${NC}"
    echo ""
    echo "$RESPONSE" | jq .

    # Extract key info
    echo ""
    echo -e "${BLUE}Key Information:${NC}"
    echo "  Name: $(echo "$RESPONSE" | jq -r '.name // "N/A"')"
    echo "  Description: $(echo "$RESPONSE" | jq -r '.description // "N/A"')"
    echo "  Version: $(echo "$RESPONSE" | jq -r '.version // "N/A"')"

    # Check capabilities
    SKILLS=$(echo "$RESPONSE" | jq -r '.skills // [] | length')
    echo "  Skills: $SKILLS"

    if [ "$SKILLS" -gt 0 ]; then
      echo ""
      echo -e "${BLUE}Available Skills:${NC}"
      echo "$RESPONSE" | jq -r '.skills[]? | "  - \(.name // .id): \(.description // "No description")"' 2>/dev/null || true
    fi
    exit 0
  elif [ "$HTTP_CODE" = "403" ]; then
    echo -e "${RED}STATUS: FORBIDDEN (HTTP 403)${NC}"
    echo "Response: $RESPONSE"
    echo ""
    echo -e "${YELLOW}Possible causes:${NC}"
    echo "  - RBAC not configured for public access"
    echo "  - Agent requires authentication for card endpoint"
    exit 5
  elif [ "$HTTP_CODE" = "404" ]; then
    echo -e "${RED}STATUS: NOT FOUND (HTTP 404)${NC}"
    echo ""
    echo -e "${YELLOW}Possible causes:${NC}"
    echo "  - Deployment still in progress"
    echo "  - Wrong agent URL"
    exit 4
  elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "${RED}STATUS: UNREACHABLE${NC}"
    echo ""
    echo -e "${YELLOW}Possible causes:${NC}"
    echo "  - Agent not deployed"
    echo "  - Network/VPN issues"
    exit 1
  else
    echo -e "${RED}STATUS: UNEXPECTED (HTTP $HTTP_CODE)${NC}"
    echo "Response: $RESPONSE"
    exit 6
  fi
}

# ===========================================
# Command: health - Check Agent Health
# ===========================================
cmd_health() {
  echo -e "${BLUE}=========================================="
  echo "Agent Health Check"
  echo -e "==========================================${NC}"
  echo "Agent URL: $AGENT_URL"
  echo ""

  local all_checks_passed=true
  local critical_failure=false
  local failure_reason=""

  # Check 1: Agent Card endpoint (public)
  echo -n "1. Agent Card (/.well-known/agent.json): "
  CARD_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$AGENT_URL/.well-known/agent.json" 2>/dev/null || echo "000")
  if [ "$CARD_HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
  elif [ "$CARD_HTTP_CODE" = "000" ]; then
    echo -e "${RED}UNREACHABLE${NC}"
    critical_failure=true
    failure_reason="Agent is not reachable"
  elif [ "$CARD_HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}FORBIDDEN (may require auth)${NC}"
    all_checks_passed=false
  elif [ "$CARD_HTTP_CODE" = "404" ]; then
    echo -e "${YELLOW}NOT FOUND${NC}"
    all_checks_passed=false
  else
    echo -e "${YELLOW}HTTP $CARD_HTTP_CODE${NC}"
    all_checks_passed=false
  fi

  # Check 2: Root endpoint
  echo -n "2. Root Endpoint (/): "
  ROOT_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$AGENT_URL/" 2>/dev/null || echo "000")
  if [ "$ROOT_HTTP_CODE" = "200" ] || [ "$ROOT_HTTP_CODE" = "401" ] || [ "$ROOT_HTTP_CODE" = "405" ]; then
    echo -e "${GREEN}OK (HTTP $ROOT_HTTP_CODE)${NC}"
  elif [ "$ROOT_HTTP_CODE" = "000" ]; then
    echo -e "${RED}UNREACHABLE${NC}"
    critical_failure=true
    failure_reason="Agent is not reachable"
  elif [ "$ROOT_HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}FORBIDDEN${NC}"
    all_checks_passed=false
  elif [ "$ROOT_HTTP_CODE" = "404" ]; then
    echo -e "${YELLOW}NOT FOUND${NC}"
    all_checks_passed=false
  else
    echo -e "${YELLOW}HTTP $ROOT_HTTP_CODE${NC}"
    all_checks_passed=false
  fi

  # Check 3: OAuth Token
  echo -n "3. OAuth Token: "
  TOKEN_RESPONSE=$(curl -s -X POST "$IAS_OAUTH_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$IAS_CLIENT_ID&client_secret=$IAS_CLIENT_SECRET" 2>/dev/null || echo "{}")
  TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo -e "${GREEN}OK${NC}"
    TOKEN_OK=true
  else
    ERROR=$(echo "$TOKEN_RESPONSE" | jq -r '.error // .error_description // "Unknown error"' 2>/dev/null)
    echo -e "${RED}FAILED ($ERROR)${NC}"
    critical_failure=true
    failure_reason="OAuth authentication failed"
  fi

  # Check 4: Authenticated request (only if token succeeded)
  if [ "$TOKEN_OK" = true ]; then
    echo -n "4. Authenticated Request: "
    AUTH_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -H "Authorization: Bearer $TOKEN" \
      "$AGENT_URL/" 2>/dev/null || echo "000")
    if [ "$AUTH_HTTP_CODE" = "200" ] || [ "$AUTH_HTTP_CODE" = "405" ]; then
      echo -e "${GREEN}OK (HTTP $AUTH_HTTP_CODE)${NC}"
    elif [ "$AUTH_HTTP_CODE" = "401" ]; then
      echo -e "${RED}UNAUTHORIZED${NC}"
      critical_failure=true
      failure_reason="Authentication rejected by agent"
    elif [ "$AUTH_HTTP_CODE" = "403" ]; then
      echo -e "${YELLOW}FORBIDDEN${NC}"
      all_checks_passed=false
    elif [ "$AUTH_HTTP_CODE" = "404" ]; then
      echo -e "${YELLOW}NOT FOUND${NC}"
      all_checks_passed=false
    elif [ "$AUTH_HTTP_CODE" = "000" ]; then
      echo -e "${RED}UNREACHABLE${NC}"
      critical_failure=true
      failure_reason="Agent is not reachable"
    else
      echo -e "${YELLOW}HTTP $AUTH_HTTP_CODE${NC}"
      all_checks_passed=false
    fi
  fi

  # Summary and exit code
  echo ""
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}Summary:${NC}"

  if [ "$critical_failure" = true ]; then
    echo -e "${RED}FAILED: $failure_reason${NC}"
    if [ "$CARD_HTTP_CODE" = "000" ] || [ "$ROOT_HTTP_CODE" = "000" ]; then
      echo ""
      echo -e "${YELLOW}Suggestions:${NC}"
      echo "  - Check if deployment completed in GitHub Actions"
      echo "  - Verify AGENT_URL is correct"
      echo "  - Check network/VPN connection"
      exit 1
    elif [ "$TOKEN_OK" = false ]; then
      echo ""
      echo -e "${YELLOW}Suggestions:${NC}"
      echo "  - Verify IAS_OAUTH_URL is correct"
      echo "  - Check IAS_CLIENT_ID and IAS_CLIENT_SECRET"
      exit 2
    elif [ "$AUTH_HTTP_CODE" = "401" ]; then
      echo ""
      echo -e "${YELLOW}Suggestions:${NC}"
      echo "  - Check IAS client has correct permissions"
      echo "  - Verify agent RBAC configuration"
      exit 3
    fi
    exit 6
  elif [ "$all_checks_passed" = false ]; then
    if [ "$AUTH_HTTP_CODE" = "404" ] || [ "$CARD_HTTP_CODE" = "404" ]; then
      echo -e "${YELLOW}PARTIAL: Agent may still be deploying (404 responses)${NC}"
      echo ""
      echo -e "${YELLOW}Suggestions:${NC}"
      echo "  - Wait 1-2 minutes and retry"
      echo "  - Check GitHub Actions for deployment status"
      exit 4
    elif [ "$AUTH_HTTP_CODE" = "403" ] || [ "$CARD_HTTP_CODE" = "403" ]; then
      echo -e "${YELLOW}PARTIAL: Access forbidden (403 responses)${NC}"
      echo ""
      echo -e "${YELLOW}Suggestions:${NC}"
      echo "  - Check RBAC configuration in app.yaml"
      echo "  - Deployment may still be in progress"
      exit 5
    else
      echo -e "${YELLOW}PARTIAL: Some checks did not pass${NC}"
      exit 6
    fi
  else
    echo -e "${GREEN}SUCCESS: Agent is healthy and ready for testing${NC}"
    exit 0
  fi
}

# ===========================================
# Command: info - Show All Agent Information
# ===========================================
cmd_info() {
  echo -e "${BLUE}=========================================="
  echo "Agent Information"
  echo -e "==========================================${NC}"
  echo ""

  # Configuration
  echo -e "${BLUE}Configuration:${NC}"
  echo "  Agent URL: $AGENT_URL"
  echo "  OAuth URL: $IAS_OAUTH_URL"
  echo "  Client ID: ${IAS_CLIENT_ID:0:8}...${IAS_CLIENT_ID: -4}"
  echo ""

  # Health check (capture exit code)
  set +e
  cmd_health
  HEALTH_EXIT=$?
  set -e

  echo ""

  # Only show card if health check passed reasonably
  if [ $HEALTH_EXIT -le 5 ]; then
    cmd_card
  fi
}

# ===========================================
# Command: message - Send a Message
# ===========================================
cmd_message() {
  local MESSAGE="${1:-Hello, what can you help me with?}"
  local CONTEXT_ID="$2"

  echo -e "${BLUE}=========================================="
  echo "Sending Message"
  echo -e "==========================================${NC}"
  echo "Agent: $AGENT_URL"
  echo "Message: $MESSAGE"
  [ -n "$CONTEXT_ID" ] && echo "Context: $CONTEXT_ID"
  echo ""

  # Get token
  echo "Getting access token..."
  TOKEN=$(get_token)
  echo -e "${GREEN}Token obtained${NC}"
  echo ""

  # Build request payload
  MSG_ID="msg-$(date +%s)"
  REQ_ID="test-$(date +%s)"

  if [ -n "$CONTEXT_ID" ]; then
    PAYLOAD=$(jq -n \
      --arg reqId "$REQ_ID" \
      --arg msgId "$MSG_ID" \
      --arg text "$MESSAGE" \
      --arg ctxId "$CONTEXT_ID" \
      '{
        jsonrpc: "2.0",
        method: "message/send",
        id: $reqId,
        params: {
          message: {
            messageId: $msgId,
            role: "user",
            contextId: $ctxId,
            parts: [{kind: "text", text: $text}]
          }
        }
      }')
  else
    PAYLOAD=$(jq -n \
      --arg reqId "$REQ_ID" \
      --arg msgId "$MSG_ID" \
      --arg text "$MESSAGE" \
      '{
        jsonrpc: "2.0",
        method: "message/send",
        id: $reqId,
        params: {
          message: {
            messageId: $msgId,
            role: "user",
            parts: [{kind: "text", text: $text}]
          }
        }
      }')
  fi

  # Send message
  echo "Sending message..."
  HTTP_CODE=$(curl -s -o /tmp/agent_response.json -w "%{http_code}" -X POST "$AGENT_URL/" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  RESPONSE=$(cat /tmp/agent_response.json 2>/dev/null || echo "{}")

  echo ""
  echo -e "${BLUE}===========================================${NC}"
  echo "HTTP Status: $HTTP_CODE"
  echo -e "${BLUE}Response:${NC}"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

  # Analyze response
  echo ""
  echo -e "${BLUE}===========================================${NC}"

  if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}FAILED: HTTP $HTTP_CODE${NC}"
    if [ "$HTTP_CODE" = "401" ]; then
      echo "Authentication failed - check credentials"
      exit 3
    elif [ "$HTTP_CODE" = "403" ]; then
      echo "Access forbidden - check RBAC permissions"
      exit 5
    elif [ "$HTTP_CODE" = "404" ]; then
      echo "Endpoint not found - deployment may be in progress"
      exit 4
    else
      echo "Unexpected error"
      exit 6
    fi
  fi

  # Check for JSON-RPC result
  if echo "$RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
    echo -e "${GREEN}SUCCESS: Agent responded${NC}"

    # Get context ID for multi-turn
    NEW_CONTEXT=$(echo "$RESPONSE" | jq -r '.result.contextId // empty')
    if [ -n "$NEW_CONTEXT" ]; then
      echo ""
      echo -e "${YELLOW}Context ID (for follow-up): $NEW_CONTEXT${NC}"
    fi

    AGENT_TEXT=$(echo "$RESPONSE" | jq -r '.result.artifacts[0].parts[0].text // empty' 2>/dev/null)
    if [ -n "$AGENT_TEXT" ]; then
      echo ""
      echo -e "${BLUE}=========================================="
      echo "Agent Answer:"
      echo -e "==========================================${NC}"
      echo "$AGENT_TEXT"
    fi
    exit 0
  elif echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "${RED}FAILED: Agent returned error${NC}"
    echo "$RESPONSE" | jq '.error'
    exit 9
  else
    echo -e "${RED}FAILED: Unexpected response format${NC}"
    exit 9
  fi
}

# ===========================================
# Command: chat - Interactive Chat Mode
# ===========================================
cmd_chat() {
  echo -e "${BLUE}=========================================="
  echo "Interactive Chat Mode"
  echo -e "==========================================${NC}"
  echo "Agent: $AGENT_URL"
  echo "Type 'exit' or 'quit' to end the session"
  echo "Type 'new' to start a new conversation"
  echo ""

  # Get initial token
  echo "Getting access token..."
  TOKEN=$(get_token)
  echo -e "${GREEN}Token obtained${NC}"
  echo ""

  CONTEXT_ID=""

  while true; do
    echo -n -e "${GREEN}You: ${NC}"
    read -r USER_INPUT

    # Exit commands
    if [ "$USER_INPUT" = "exit" ] || [ "$USER_INPUT" = "quit" ]; then
      echo "Goodbye!"
      break
    fi

    # New conversation
    if [ "$USER_INPUT" = "new" ]; then
      CONTEXT_ID=""
      echo -e "${YELLOW}Starting new conversation...${NC}"
      echo ""
      continue
    fi

    # Skip empty input
    if [ -z "$USER_INPUT" ]; then
      continue
    fi

    # Build request
    MSG_ID="msg-$(date +%s)"
    REQ_ID="chat-$(date +%s)"

    if [ -n "$CONTEXT_ID" ]; then
      PAYLOAD=$(jq -n \
        --arg reqId "$REQ_ID" \
        --arg msgId "$MSG_ID" \
        --arg text "$USER_INPUT" \
        --arg ctxId "$CONTEXT_ID" \
        '{
          jsonrpc: "2.0",
          method: "message/send",
          id: $reqId,
          params: {
            message: {
              messageId: $msgId,
              role: "user",
              contextId: $ctxId,
              parts: [{kind: "text", text: $text}]
            }
          }
        }')
    else
      PAYLOAD=$(jq -n \
        --arg reqId "$REQ_ID" \
        --arg msgId "$MSG_ID" \
        --arg text "$USER_INPUT" \
        '{
          jsonrpc: "2.0",
          method: "message/send",
          id: $reqId,
          params: {
            message: {
              messageId: $msgId,
              role: "user",
              parts: [{kind: "text", text: $text}]
            }
          }
        }')
    fi

    # Send and get response
    echo -e "${YELLOW}Thinking...${NC}"
    RESPONSE=$(curl -s -X POST "$AGENT_URL/" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD")

    # Extract context for continuation
    NEW_CONTEXT=$(echo "$RESPONSE" | jq -r '.result.contextId // empty' 2>/dev/null)
    if [ -n "$NEW_CONTEXT" ]; then
      CONTEXT_ID="$NEW_CONTEXT"
    fi

    # Display response
    AGENT_TEXT=$(echo "$RESPONSE" | jq -r '.result.artifacts[0].parts[0].text // empty' 2>/dev/null)
    if [ -n "$AGENT_TEXT" ]; then
      echo ""
      echo -e "${BLUE}Agent:${NC} $AGENT_TEXT"
      echo ""
    else
      ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"' 2>/dev/null)
      echo -e "${RED}Error: $ERROR${NC}"
      echo ""
    fi
  done
}

# ===========================================
# Main
# ===========================================
main() {
  load_credentials
  validate_credentials

  COMMAND="${1:-message}"

  case "$COMMAND" in
    card)
      cmd_card
      ;;
    health)
      cmd_health
      ;;
    info)
      cmd_info
      ;;
    chat)
      cmd_chat
      ;;
    message|*)
      # If first arg doesn't match a command, treat it as a message
      if [ "$COMMAND" = "message" ]; then
        cmd_message "$2" "$3"
      else
        cmd_message "$1" "$2"
      fi
      ;;
  esac
}

main "$@"
