#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_LOG="$ROOT_DIR/.backend.log"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3500}"
BACKEND_DEPS_STAMP="$BACKEND_DIR/.venv/.deps_installed"
FRONTEND_DEPS_STAMP="$FRONTEND_DIR/node_modules/.deps_installed"
MIN_PYTHON_VERSION="${MIN_PYTHON_VERSION:-3.11}"
MIN_NODE_MAJOR="${MIN_NODE_MAJOR:-20}"
MIN_NODE_MINOR="${MIN_NODE_MINOR:-9}"
NVM_VERSION_FILE="$ROOT_DIR/.nvmrc"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

pick_python() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return
  fi

  if command -v python >/dev/null 2>&1; then
    echo "python"
    return
  fi

  echo ""
}

load_nvm() {
  if command -v nvm >/dev/null 2>&1; then
    return 0
  fi

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$nvm_dir/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$nvm_dir/nvm.sh"
  elif [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "/opt/homebrew/opt/nvm/nvm.sh"
  elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "/usr/local/opt/nvm/nvm.sh"
  fi

  command -v nvm >/dev/null 2>&1
}

python_version_meets_minimum() {
  local python_cmd="$1"
  "$python_cmd" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1
}

node_version_meets_minimum() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local version
  version="$(node -p 'process.versions.node' 2>/dev/null || true)"
  [ -n "$version" ] || return 1

  local major minor
  major="${version%%.*}"
  minor="$(echo "$version" | cut -d. -f2)"

  if [ "$major" -gt "$MIN_NODE_MAJOR" ]; then
    return 0
  fi

  if [ "$major" -eq "$MIN_NODE_MAJOR" ] && [ "$minor" -ge "$MIN_NODE_MINOR" ]; then
    return 0
  fi

  return 1
}

run_install_cmd() {
  echo "Running: $*"
  "$@"
}

ensure_python_available() {
  local python_cmd
  python_cmd="$(pick_python)"
  if [ -n "$python_cmd" ] && python_version_meets_minimum "$python_cmd"; then
    PYTHON_CMD="$python_cmd"
    return 0
  fi

  echo "Python ${MIN_PYTHON_VERSION}+ is required."

  if command -v brew >/dev/null 2>&1; then
    echo "Installing Python via Homebrew..."
    run_install_cmd brew install python@3.11

    local brew_python=""
    if brew --prefix python@3.11 >/dev/null 2>&1; then
      brew_python="$(brew --prefix python@3.11)/bin/python3.11"
    fi

    if [ -n "$brew_python" ] && [ -x "$brew_python" ]; then
      PYTHON_CMD="$brew_python"
      return 0
    fi

    python_cmd="$(pick_python)"
    if [ -n "$python_cmd" ] && python_version_meets_minimum "$python_cmd"; then
      PYTHON_CMD="$python_cmd"
      return 0
    fi
  fi

  cat <<EOF
Unable to provision Python automatically.
Install Python ${MIN_PYTHON_VERSION}+ and re-run ./run-all.sh.

macOS with Homebrew:
  brew install python@3.11

Ubuntu/Debian:
  sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
EOF
  exit 1
}

ensure_node_available() {
  if node_version_meets_minimum && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if load_nvm; then
    local requested_node="20"
    if [ -f "$NVM_VERSION_FILE" ]; then
      requested_node="$(tr -d '[:space:]' <"$NVM_VERSION_FILE")"
    fi
    echo "Installing/activating Node.js ${requested_node} via nvm..."
    nvm install "$requested_node"
    nvm use "$requested_node"
  elif command -v brew >/dev/null 2>&1; then
    echo "Installing Node.js via Homebrew..."
    run_install_cmd brew install node@20

    local node_prefix=""
    if node_prefix="$(brew --prefix node@20 2>/dev/null)"; then
      PATH="$node_prefix/bin:$PATH"
      export PATH
    fi
  fi

  if node_version_meets_minimum && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  cat <<EOF
Unable to provision a compatible Node.js runtime automatically.
Install Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ and npm, then re-run ./run-all.sh.

Preferred:
  nvm install $(tr -d '[:space:]' <"$NVM_VERSION_FILE" 2>/dev/null || echo "20")

macOS with Homebrew:
  brew install node@20

Ubuntu/Debian:
  sudo apt-get update && sudo apt-get install -y nodejs npm
EOF
  exit 1
}

port_in_use() {
  local port="$1"

  # Prefer ss when available (common on Linux), then fall back for macOS.
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" | tail -n +2 | grep -q ":$port"
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >/dev/null 2>&1
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -an | grep -E "[:.]$port[[:space:]]+.*LISTENING|[:.]$port[[:space:]]+.*LISTEN" >/dev/null 2>&1
    return
  fi

  # No supported port check command was found; continue without blocking startup.
  return 1
}

PYTHON_CMD=""
ensure_python_available
ensure_node_available

if port_in_use "$FRONTEND_PORT"; then
  echo "Port $FRONTEND_PORT is already in use. Stop the existing frontend process, or run with a different FRONTEND_PORT."
  exit 1
fi

if port_in_use "$BACKEND_PORT"; then
  echo "Port $BACKEND_PORT is already in use. Stop the existing backend process, or run with a different BACKEND_PORT."
  exit 1
fi

cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "Creating backend virtual environment..."
  "$PYTHON_CMD" -m venv .venv
fi

if [ -x "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/Scripts/python.exe"
elif [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
else
  echo "Could not find python executable inside backend/.venv"
  exit 1
fi

if [ ! -f "$BACKEND_DEPS_STAMP" ] || [ requirements.txt -nt "$BACKEND_DEPS_STAMP" ]; then
  echo "Installing backend dependencies..."
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r requirements.txt
  touch "$BACKEND_DEPS_STAMP"
fi

cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ] || [ ! -f "$FRONTEND_DEPS_STAMP" ] || [ package-lock.json -nt "$FRONTEND_DEPS_STAMP" ] || [ package.json -nt "$FRONTEND_DEPS_STAMP" ]; then
  echo "Installing frontend dependencies..."
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
  mkdir -p node_modules
  touch "$FRONTEND_DEPS_STAMP"
fi

cd "$BACKEND_DIR"
BACKEND_ENV=()
if [ -z "${DATABASE_URL:-}" ] && [ ! -f ".env" ]; then
  echo "No backend DATABASE_URL configured; using local SQLite fallback (backend/builderpro.db)."
  BACKEND_ENV+=("DATABASE_URL=sqlite:///./builderpro.db")
fi

FRONTEND_ORIGIN="http://localhost:$FRONTEND_PORT"
if [ -n "${ALLOWED_ORIGINS:-}" ]; then
  BACKEND_ENV+=("ALLOWED_ORIGINS=${ALLOWED_ORIGINS},${FRONTEND_ORIGIN}")
else
  BACKEND_ENV+=("ALLOWED_ORIGINS=${FRONTEND_ORIGIN}")
fi

echo "Starting backend on http://localhost:$BACKEND_PORT ..."
if [ ${#BACKEND_ENV[@]} -gt 0 ]; then
  env "${BACKEND_ENV[@]}" "$PYTHON_BIN" -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
else
  "$PYTHON_BIN" -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
fi
BACKEND_PID=$!

cleanup() {
  echo ""
  echo "Stopping services..."
  if kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

sleep 2
if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
  echo "Backend failed to start. See log: $BACKEND_LOG"
  tail -n 80 "$BACKEND_LOG" || true
  exit 1
fi

echo "Backend started (PID $BACKEND_PID)."
echo "Starting frontend on http://localhost:$FRONTEND_PORT ..."
echo ""
echo "App URLs:"
echo "- Frontend: http://localhost:$FRONTEND_PORT"
echo "- Backend:  http://localhost:$BACKEND_PORT"
echo "- API Docs: http://localhost:$BACKEND_PORT/docs"
echo ""
echo "Tip: override ports with FRONTEND_PORT=3000 or BACKEND_PORT=8001 if needed."
echo "Press Ctrl+C to stop both services."

cd "$FRONTEND_DIR"
NEXT_PUBLIC_API_URL="http://localhost:$BACKEND_PORT/api" npm run dev -- --port "$FRONTEND_PORT"
