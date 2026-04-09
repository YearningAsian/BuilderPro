# BuilderPro Explained

## What this project is
`BuilderPro` is a full-stack construction operations app for managing **materials, estimates, projects, vendors, customers, and team access**.

It combines:
- a **Next.js frontend** in `frontend/`
- a **FastAPI backend** in `backend/`
- a **PostgreSQL/Supabase database** defined in `supabase/migrations/`

---

## Main goal
The goal of the project is to help a construction business:

1. **organize master data**
   - materials
   - vendors
   - customers
2. **build project estimates**
   - add line items
   - apply waste and tax percentages
   - keep price snapshots for each project
3. **support team collaboration**
   - company signup
   - workspace membership
   - invite-based onboarding
4. **move toward a production-ready estimating system**
   - typed API layer
   - authentication
   - database constraints and indexes

---

## How the app is structured

### 1) Frontend (`frontend/`)
The UI is built with **Next.js 16 + React 19 + TypeScript**.

Key areas:
- `app/signin`, `app/signup`, `app/join-invite` → authentication flows
- `app/projects`, `app/materials`, `app/orders` → main business screens
- `src/components/` → reusable UI blocks such as dashboard, lists, search, and project detail
- `src/services/api.ts` → typed API client for the backend
- `src/hooks/useStore.tsx` → current prototype state store using seed data

### 2) Backend (`backend/`)
The API is built with **FastAPI + SQLAlchemy**.

Main routes:
- `auth.py` → sign-in, sign-out, company signup, invites
- `materials.py` → material CRUD
- `projects.py` → project CRUD
- `orders.py` → project item / order-style line item management
- `customers.py` and `vendors.py` → related business records

### 3) Database (`supabase/`)
The schema is managed through **Supabase SQL migrations**, not runtime auto-creation.

Core tables:
- `users`
- `customers`
- `vendors`
- `materials`
- `projects`
- `project_items`
- `workspaces`
- `workspace_members`
- `workspace_invites`

---

## What the product currently does

### Core implemented capabilities
- user authentication through **Supabase Auth**
- company/workspace creation on signup
- invite-based team onboarding
- customer and vendor records
- material catalog management
- project creation and status tracking
- project line item calculations with:
  - quantity
  - waste percentage
  - unit cost snapshot
  - subtotal calculation

### Important calculation behavior
The system keeps estimate values stable by storing snapshot fields on each project item:
- `total_qty = quantity × (1 + waste_pct / 100)`
- `line_subtotal = total_qty × unit_cost`

This means later changes to a material record do not silently rewrite old project estimates.

---

## Current development status
The project is **partly production-oriented and partly prototype**.

### Already solid
- backend API structure
- database constraints and indexes
- auth wiring with Supabase
- role/workspace model

### Still being finished
- frontend still relies heavily on `src/data/seed.ts` and `useStore()` for live screen data
- typed API methods exist, but not every screen is fully connected to the backend yet
- workspace/invite UI is present in flow design, but broader team management UX can still be expanded
- testing and reporting/export features are still limited

---

## Typical user flow
1. A company admin signs up from `app/signup/`.
2. The backend creates a user and a workspace.
3. The admin adds customers, vendors, and materials.
4. The team creates projects.
5. Materials are added as project items.
6. Waste and pricing are calculated into estimate subtotals.
7. Admins can invite additional users into the workspace.

---

## Why this project matters
BuilderPro is aiming to become a practical internal tool for construction teams that need:
- faster estimating
- cleaner material tracking
- reusable pricing data
- multi-user collaboration under one company workspace

In short, it is a **construction estimating and operations foundation** that is moving from prototype data toward a real connected production app.

---

## Suggested next step
The most valuable next step is to finish connecting the frontend screens to the real backend APIs so the app operates fully on the Supabase/Postgres data model instead of seed-only local state.
