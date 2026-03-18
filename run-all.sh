#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_LOG="$ROOT_DIR/.backend.log"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

port_in_use() {
  local port="$1"
  ss -ltn "( sport = :$port )" | tail -n +2 | grep -q ":$port"
}

require_command python3
require_command npm
require_command ss

if port_in_use 3000; then
  echo "Port 3000 is already in use. Stop the existing frontend process, then re-run ./run-all.sh"
  exit 1
fi

if port_in_use 8000; then
  echo "Port 8000 is already in use. Stop the existing backend process, then re-run ./run-all.sh"
  exit 1
fi

cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "Creating backend virtual environment..."
  python3 -m venv .venv
fi

PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
PIP_BIN="$BACKEND_DIR/.venv/bin/pip"
BACKEND_DEPS_STAMP="$BACKEND_DIR/.venv/.deps_installed"

if [ ! -f "$BACKEND_DEPS_STAMP" ] || [ requirements.txt -nt "$BACKEND_DEPS_STAMP" ]; then
  echo "Installing backend dependencies..."
  "$PIP_BIN" install -r requirements.txt
  touch "$BACKEND_DEPS_STAMP"
fi

cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

cd "$BACKEND_DIR"
BACKEND_ENV=()
if [ -z "${DATABASE_URL:-}" ] && [ ! -f ".env" ]; then
  echo "No backend DATABASE_URL configured; using local SQLite fallback (backend/builderpro.db)."
  BACKEND_ENV+=("DATABASE_URL=sqlite:///./builderpro.db")
fi

echo "Starting backend on http://localhost:8000 ..."
env "${BACKEND_ENV[@]}" "$PYTHON_BIN" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 >"$BACKEND_LOG" 2>&1 &
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
echo "Starting frontend on http://localhost:3000 ..."
echo ""
echo "App URLs:"
echo "- Frontend: http://localhost:3000"
echo "- Backend:  http://localhost:8000"
echo "- API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both services."

cd "$FRONTEND_DIR"
npm run dev -- --port 3000
