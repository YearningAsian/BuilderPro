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

PYTHON_CMD="$(pick_python)"
if [ -z "$PYTHON_CMD" ]; then
  echo "Missing required command: python3 or python"
  exit 1
fi

require_command npm

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

echo "Starting backend on http://localhost:$BACKEND_PORT ..."
env "${BACKEND_ENV[@]}" "$PYTHON_BIN" -m uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
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
npm run dev -- --port "$FRONTEND_PORT"
