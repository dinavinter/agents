#!/bin/bash
# Script to install dependencies for App Foundation agent
# This script runs pip install and provides clear progress feedback
# DO NOT INTERRUPT - the script will indicate when complete

set -e

echo "=========================================="
echo "  App Foundation Dependencies Installer"
echo "=========================================="
echo ""

# Find the project root (where requirements.txt is)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Navigate up to find project root (works with any skills directory structure)
PROJECT_ROOT="$SCRIPT_DIR"
while [[ ! -f "$PROJECT_ROOT/requirements.txt" && "$PROJECT_ROOT" != "/" ]]; do
    PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

# Check if we're in a project with requirements.txt
if [[ ! -f "$PROJECT_ROOT/requirements.txt" ]]; then
    # Try current directory
    if [[ -f "requirements.txt" ]]; then
        PROJECT_ROOT="$(pwd)"
    else
        echo "ERROR: requirements.txt not found"
        echo "Please run this script from the project root directory"
        exit 1
    fi
fi

cd "$PROJECT_ROOT"
echo "Project root: $PROJECT_ROOT"

# Setup virtual environment
VENV_DIR=".venv"
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    echo "Virtual environment created at: $PROJECT_ROOT/$VENV_DIR"
else
    echo "Using existing virtual environment: $PROJECT_ROOT/$VENV_DIR"
fi

# Enforce SAP PyPI proxy via pip.conf in the virtualenv
# This ensures any pip install within this venv uses only the SAP proxy
PIP_CONF="$PROJECT_ROOT/$VENV_DIR/pip.conf"
if [[ ! -f "$PIP_CONF" ]]; then
    cat > "$PIP_CONF" <<'PIPCONF'
[global]
index-url = https://int.repositories.cloud.sap/artifactory/api/pypi/proxy-3rd-party-pypi/simple
trusted-host = int.repositories.cloud.sap
PIPCONF
    echo "Created pip.conf in virtualenv (SAP proxy enforced)"
fi

# Use the venv's pip directly (no need to source activate)
PIP_CMD="$PROJECT_ROOT/$VENV_DIR/bin/pip"
PYTHON_CMD="$PROJECT_ROOT/$VENV_DIR/bin/python"

echo "Python: $PYTHON_CMD"
echo "Pip: $PIP_CMD"

echo ""
echo "=========================================="
echo "  Starting pip install..."
echo "  This will take 3-5 minutes."
echo "  DO NOT INTERRUPT - wait for completion."
echo "=========================================="
echo ""

# Create a log file for the installation
LOG_FILE="/tmp/pip_install_$$.log"

# Run pip install using the venv's pip directly
"$PIP_CMD" install -r requirements.txt \
    --index-url "https://int.repositories.cloud.sap/artifactory/api/pypi/proxy-3rd-party-pypi/simple" \
    --progress-bar on \
    2>&1 | tee "$LOG_FILE"

# Check if installation succeeded
if [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    echo ""
    echo "=========================================="
    echo "  SUCCESS! Dependencies installed."
    echo "=========================================="
    echo ""
    echo "Next step: Run the agent:"
    echo ""
    echo "  export \$(grep -v '^#' app/.env.local | xargs) && .venv/bin/python app/main.py --host 0.0.0.0 --port 9000"
    echo ""
    rm -f "$LOG_FILE"
    exit 0
else
    echo ""
    echo "=========================================="
    echo "  FAILED! See errors above."
    echo "=========================================="
    echo "Log saved to: $LOG_FILE"
    exit 1
fi
