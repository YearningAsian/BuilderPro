# Quick Start Guide for BuilderPro

## Fastest Way (Run Everything)

### Prerequisites
- Python 3.8+
- Node.js + npm

### Start the full stack
From the project root:

```bash
cd /home/colin/BuilderPro
./run-all.sh
```

This starts:
- Backend API on `http://localhost:8000`
- API docs on `http://localhost:8000/docs`
- Frontend on `http://localhost:3000`

Press `Ctrl+C` in that terminal to stop both services.

### What `run-all.sh` does
- Creates `backend/.venv` if missing
- Installs backend dependencies when needed
- Installs frontend dependencies when needed
- Starts backend + frontend together
- Uses SQLite fallback automatically only when no backend DB config is provided

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
npm run dev -- --port 3000
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
curl -I http://localhost:3000
```
