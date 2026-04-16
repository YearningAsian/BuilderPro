# Quick Start Guide for BuilderPro

## Fastest Way (Run Everything)

### Prerequisites
- macOS with Homebrew, or a machine that already has Python 3.11+ and Node.js 20.9+ installed
- npm

### Start the full stack
From the project root:

```bash
cd /home/colin/BuilderPro
./run-all.sh
```

This starts:
- Backend API on `http://localhost:8000`
- API docs on `http://localhost:8000/docs`
- Frontend on `http://localhost:3500`
- A seeded demo workspace for local walkthroughs when SQLite fallback is used

Press `Ctrl+C` in that terminal to stop both services.

### What `run-all.sh` does
- Checks for Python 3.11+ and Node.js 20.9+
- Auto-installs Python with Homebrew when missing
- Auto-installs Node.js through `nvm` when available, otherwise Homebrew on macOS
- Creates `backend/.venv` if missing
- Installs backend dependencies when needed
- Installs frontend dependencies when needed
- Seeds a demo workspace automatically for local SQLite startup
- Starts backend + frontend together
- Uses SQLite fallback automatically only when no backend DB config is provided

If Homebrew or `nvm` are not available, the script exits with the exact install command needed for the current machine.

### Demo flow

`run-all.sh` now uses the local SQLite database by default for local demo sessions, even if `backend/.env` points at another database.
If you want to force your external DB instead, run with `USE_LOCAL_SQLITE_FOR_RUN_ALL=0`.

Open the homepage or sign-in page and click `Launch Interactive Demo`.
That signs you into a seeded workspace with projects, materials, vendors, customers, search data, and purchase-order activity.

---

## Manual Start (If Needed)

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=sqlite:///./builderpro.db uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev -- --port 3500
```

---

## Optional Docker Backend

If Docker daemon permissions are configured for your user:

```bash
cd backend
docker compose up --build
```

---

## Quick Verification

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/db
curl -I http://localhost:3500
```
