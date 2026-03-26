# BuilderPro Changelog

All notable changes to this project are documented here.
Format: `[Date] — Area — Description`

---

## 2026-03-26 — Database & Backend Hardening

### Fixed — Critical
- **UUID auto-generation bug** (`backend/app/models/models.py`)
  - All 6 models (`User`, `Customer`, `Vendor`, `Material`, `Project`, `ProjectItem`) were defaulting to the same zero UUID (`00000000-0000-0000-0000-000000000000`), causing primary key collisions on every insert.
  - Fixed by replacing `default=lambda: UUID('...')` with `default=uuid4` from Python's `uuid` stdlib.

### Fixed — Data Integrity
- **Block deleting materials in use** (`backend/app/api/materials.py`)
  - `DELETE /api/materials/{id}` previously allowed deletion of materials referenced by project items, silently breaking estimate line items via orphaned foreign keys.
  - Now returns `HTTP 409 Conflict` with a clear error message if any `project_items` row references the material.

- **`ON DELETE RESTRICT` on `project_items.material_id`** (`supabase/migrations/20260301000000_create_initial_schema.sql`)
  - The FK from `project_items` to `materials` now explicitly uses `ON DELETE RESTRICT` at the DB level, enforcing the same protection at the database layer regardless of which client touches the data.

### Fixed — Schema / Models
- **DB-level `CHECK` constraints added to SQLAlchemy models** (`backend/app/models/models.py`)
  - `User.role` — enforces `IN ('admin', 'user')`
  - `Project.status` — enforces `IN ('draft', 'active', 'closed')`
  - `Material.unit_cost`, `Material.default_waste_pct` — enforce `>= 0`
  - `Project.default_tax_pct`, `Project.default_waste_pct` — enforce `>= 0`
  - `ProjectItem.quantity` — enforces `> 0`
  - `ProjectItem.unit_cost`, `ProjectItem.waste_pct` — enforce `>= 0`

- **FK indexes added to SQLAlchemy models** (`backend/app/models/models.py`)
  - `Material.category`, `Material.default_vendor_id`
  - `Project.customer_id`, `Project.status`, `Project.created_by`
  - `ProjectItem.project_id`, `ProjectItem.material_id`

- **`ON DELETE RESTRICT` applied to `ProjectItem.material_id` FK** (`backend/app/models/models.py`)
  - Previously had no delete rule; now matches the SQL migration.

### Fixed — API Validation
- **Enum validation on `role` and `status` fields** (`backend/app/schemas/schemas.py`)
  - `UserBase.role` changed from `str` to `Literal["admin", "user"]` — invalid values rejected at API boundary.
  - `ProjectBase.status` and `ProjectUpdate.status` changed to `Literal["draft", "active", "closed"]`.

- **Non-negative validators on numeric fields** (`backend/app/schemas/schemas.py`)
  - `MaterialBase`: `unit_cost >= 0`, `default_waste_pct >= 0`
  - `ProjectBase` / `ProjectUpdate`: `default_tax_pct >= 0`, `default_waste_pct >= 0`

### Removed — Dead Code
- **`backend/app/db/database.py`** — contained a duplicate, unused `create_engine` call with hardcoded credentials (`postgresql://user:password@localhost/builderpro`). The app uses `backend/app/db/base.py` exclusively for the DB engine. File removed to eliminate drift risk.

- **`Base.metadata.create_all(bind=engine)` in `backend/app/main.py`** — removed runtime schema creation. Schema is now exclusively managed via Supabase migrations (`supabase/migrations/`). Using `create_all` in production bypasses migration history and can silently apply partial schema.

### Added — Performance
- **7 indexes added to SQL migration** (`supabase/migrations/20260301000000_create_initial_schema.sql`)
  - `idx_materials_category` — filters by material category
  - `idx_materials_vendor` — joins materials → vendors
  - `idx_projects_customer` — joins projects → customers
  - `idx_projects_status` — filters by project status
  - `idx_projects_created_by` — filters by creator
  - `idx_project_items_project` — joins line items → projects (cascade queries)
  - `idx_project_items_material` — joins line items → materials

### Setup
- **`backend/.env` created** from `backend/.env.example`
  - Fill in `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, and `SECRET_KEY` with your Supabase project values to connect to the online database.

---

## 2026-03-25 — Project Initialization

- Cloned repository from `https://github.com/YearningAsian/BuilderPro.git`
- Created project-local Python virtual environment at `backend/.venv`
- Installed backend dependencies from `backend/requirements.txt`
- Installed frontend dependencies via `npm install` in `frontend/`
- Confirmed backend starts on `http://localhost:8000` with SQLite fallback
- Confirmed frontend starts on `http://localhost:3000`
