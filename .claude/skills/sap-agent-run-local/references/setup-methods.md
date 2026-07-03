# Setup Methods for Running Agent Locally

This document describes the two methods for running an App Foundation agent locally.

## Method 1: Python Virtual Environment (Recommended for Development)

**Best for:** Active development, debugging, quick iteration cycles

**Advantages:**
- Direct access to Python code for debugging
- Faster restart times
- Easy to modify dependencies
- Native IDE integration

**Prerequisites:**
- Python 3.13+ installed
- AI Core credentials

### Setup Steps

1. **Create `app/.env.local`** with your credentials:

Copy the template file and fill in your credentials:
```bash
SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
cp "$SKILL_PATH/templates/.env.local" app/.env.local
```

Then edit `app/.env.local` with your actual credentials.

2. **Install dependencies:**

**IMPORTANT:** Use the install script - it handles everything automatically. DO NOT interrupt it with Ctrl+C.

```bash
SKILL_PATH=$(find . -type d -name "sap-agent-run-local" -path "*/skills/*" 2>/dev/null | head -1)
bash "$SKILL_PATH/scripts/install_deps.sh"
```

This script will:
- Create virtual environment (`.venv`) if it doesn't exist
- Install all dependencies with progress feedback
- Show clear SUCCESS or FAILED message when done

**The installation takes 3-5 minutes. Wait for the "SUCCESS" message before proceeding.**

3. **Run the agent:**
```bash
export $(grep -v '^#' app/.env.local | xargs) && .venv/bin/python app/main.py --host 0.0.0.0 --port 9000
```

The server will run in the foreground. Keep this terminal open and use a new terminal for testing.

---

## Method 2: Docker (Recommended for WSL/Windows)

**Best for:** Consistent environment, deployment testing, Windows/WSL users

**Advantages:**
- Consistent with production environment
- Isolated dependencies
- Works reliably on Windows/WSL

**Prerequisites:**
- Docker installed and running
- AI Core credentials

### Setup Steps

1. **Verify `app/.env.local` exists:**
```bash
cat app/.env.local 2>/dev/null || echo "No .env.local file found"
```

If missing, create it using the template from Method 1.

2. **Build Docker image:**
```bash
docker build -t my-agent .
```

3. **Run the agent:**
```bash
docker run -p 9000:9000 --env-file app/.env.local my-agent
```

The agent will start at `http://localhost:9000`.

---

## Restarting the Agent

### Python Virtual Environment
```bash
export $(grep -v '^#' app/.env.local | xargs) && .venv/bin/python app/main.py --host 0.0.0.0 --port 9000
```

### Docker
```bash
# Stop and remove existing container
docker stop my-agent && docker rm my-agent

# Run again
docker run -p 9000:9000 --env-file app/.env.local --name my-agent my-agent