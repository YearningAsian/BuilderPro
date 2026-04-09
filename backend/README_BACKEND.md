# BuilderPro Backend

FastAPI backend for BuilderPro. The API is workspace-aware and currently serves auth, invites, materials, projects, orders, customers, vendors, search, audit activity, and workspace admin workflows.

## Requirements

- Python 3.11+ recommended
- PostgreSQL or Supabase Postgres
- pip

## Install

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

Copy `.env.example` to `.env` and fill in the values you use locally.

```bash
cp .env.example .env
```

Current backend config reads:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/builderpro
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ENABLE_LOCAL_AUTH_FALLBACK=true
SECRET_KEY=your-secret-key-change-in-production
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` is preferred on the backend for signup, invite, and storage flows.
- `ENABLE_LOCAL_AUTH_FALLBACK=true` allows local dev signup to keep working when Supabase rate-limits rapid test traffic.
- The backend normalizes `postgres://...` URLs to `postgresql://...`.

## Run

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API base: `http://localhost:8000/api`

Health endpoints:

- `GET /health`
- `GET /health/db`

Docs:

- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`

## Current API Areas

- `auth` sign-in, sign-out, signup-company, forgot-password, recovery verification, password reset
- `auth` workspace members, invites, audit log, workspace profile, billing summary
- `materials` CRUD, CSV import, price history, link attachments, uploaded attachments
- `projects` CRUD, duplication, estimate-document export
- `orders` project-item ordering, vendor batch status updates, PO document generation, delivery tracking
- `customers` CRUD
- `vendors` CRUD
- `search` workspace-wide search across materials, projects, customers, and vendors

## Testing

Backend tests live under `backend/tests`.

Run them with:

```bash
cd backend
python3 -m pytest
```

Current test coverage includes:

- auth and workspace recovery
- materials enhancements
- orders workflow

## Database and Migrations

- Schema is managed through `supabase/migrations/`
- The app does not call `Base.metadata.create_all()` at startup in normal runtime
- Workspace ownership is enforced in the current schema and migrations

## Known Gaps

- Frontend session handling is still client-storage based and needs hardening
- Test coverage is still thin outside the current backend and Playwright workflow slices
- Local build and test success still depend on the correct Python and Node versions being installed
