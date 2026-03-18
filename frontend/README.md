# BuilderPro – Frontend Prototype

A barebones construction-estimating prototype built with **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4**, **Zod v4**, and **TanStack Query**.

The frontend runs entirely on hardcoded seed data (no backend needed yet). Swap the in-memory store for real API calls when the backend is ready.

---

## Quick Start

```bash
cd frontend
npm install
npm run dev        # → http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

---

## Architecture

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (QueryProvider → StoreProvider → Nav)
│   ├── page.tsx                  # Dashboard
│   ├── materials/page.tsx        # Materials catalog
│   ├── projects/page.tsx         # Projects list
│   ├── projects/[id]/page.tsx    # Project detail + Record Builder
│   ├── search/page.tsx           # Global search
│   ├── orders/page.tsx           # Redirects → /projects
│   └── globals.css               # Tailwind + custom CSS variables
├── src/
│   ├── types/
│   │   ├── index.ts              # TS interfaces (mirrors Pydantic schemas 1-to-1)
│   │   └── schemas.ts            # Zod validation schemas for forms
│   ├── data/
│   │   └── seed.ts               # Hardcoded materials, vendors, customers, projects
│   ├── hooks/
│   │   ├── useStore.tsx          # React Context – in-memory CRUD + cost calculations
│   │   └── useDebounce.ts        # Generic debounce hook (250-300 ms)
│   ├── services/
│   │   └── api.ts                # Type-safe API client (ready for FastAPI swap)
│   ├── providers/
│   │   └── QueryProvider.tsx     # TanStack Query client provider
│   ├── lib/
│   │   └── format.ts             # formatCurrency, formatPercent, formatDate, truncate
│   └── components/
│       ├── Navigation.tsx        # HubSpot-style sidebar nav
│       ├── Dashboard/
│       │   └── Dashboard.tsx     # KPI cards + recent projects table
│       ├── Materials/
│       │   └── MaterialsList.tsx # Searchable, filterable, sortable materials table
│       ├── Projects/
│       │   ├── ProjectsList.tsx  # Sortable projects table with inline create form
│       │   └── ProjectDetail.tsx # Project header + embedded RecordBuilder
│       ├── Records/
│       │   └── RecordBuilder.tsx # Core estimate builder (add/remove/edit line items)
│       └── Search/
│           └── SearchBar.tsx     # Debounced global search across materials & projects
```

---

## What Has Been Done (Frontend)

### Core Infrastructure
| Area | Details |
|------|---------|
| **TypeScript interfaces** | Every backend model mirrored: `User`, `Customer`, `Vendor`, `Material`, `Project`, `ProjectItem` with `Create` variants |
| **Zod schemas** | Client-side validation for material, project, project-item, customer, vendor create forms |
| **Seed data** | 15 construction materials (8 categories), 5 vendors, 3 customers, 3 projects with sample line items |
| **State management** | `useStore` React Context with full CRUD, cost calculation helpers, and lookup functions |
| **API client** | Generic type-safe HTTP client (`api.ts`) with typed endpoints for every resource – ready to swap from in-memory to real backend |
| **TanStack Query** | Provider configured with 30 s stale time, 1 retry – hooks ready to wrap API calls |

### Pages & Features
| Page | Route | Features |
|------|-------|----------|
| **Dashboard** | `/` | 6 live KPI cards, recent projects table with status badges, "New Project" link |
| **Materials** | `/materials` | Debounced search, 8-category filter chips, sortable columns, vendor display, waste %, taxable indicator |
| **Projects list** | `/projects` | Sortable table, inline project create form (name + customer dropdown), status badges, estimate totals |
| **Project detail** | `/projects/[id]` | Project metadata header, embedded Record Builder |
| **Record Builder** | (component) | Material selector dropdown with search, inline-editable quantity/cost/waste fields, passive cost estimation panel (subtotal with waste + tax), sort by any column, remove items |
| **Search** | `/search` | Debounced global search across materials and projects, tabbed filtering (All / Materials / Projects), direct links to results |

### Design System
- **HubSpot-inspired UI**: dark charcoal sidebar (`#2d3748`), orange accent (`#dd6b20`), clean card-based layout
- **Responsive**: mobile hamburger nav, stacked layouts on small screens
- **Custom CSS classes**: `.card`, `.bp-table` (uppercase headers, hover rows), `.animate-fade-in`
- **Status badges**: green (active), yellow (draft), gray (closed)

---

## What Needs to Be Done (Backend)

The FastAPI backend already has a complete REST API with 25 CRUD endpoints across 5 resources. Below is what's needed to connect the frontend to the backend and reach production readiness.

### 1. Connect Frontend to Backend API

The frontend API client (`src/services/api.ts`) has typed methods for every endpoint. To switch from seed data to the real backend:

1. Set `API_BASE` in `api.ts` to the FastAPI URL (e.g. `http://localhost:8000/api/v1`)
2. Replace `useStore` calls in each component with TanStack Query hooks that call the API client
3. Remove the `StoreProvider` from `layout.tsx`

### 2. Existing Backend Endpoints (Already Implemented)

| Resource | Endpoints | Notes |
|----------|-----------|-------|
| **Materials** | `GET/POST /materials`, `GET/PUT/DELETE /materials/{id}` | Validates vendor existence on create |
| **Projects** | `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}` | GET single returns `ProjectDetail` (includes customer + items) |
| **Project Items** | `GET/POST /orders`, `GET/PUT/DELETE /orders/{id}` | POST requires `project_id` query param; auto-calculates `total_qty` and `line_subtotal` |
| **Customers** | `GET/POST /customers`, `GET/PUT/DELETE /customers/{id}` | Standard CRUD |
| **Vendors** | `GET/POST /vendors`, `GET/PUT/DELETE /vendors/{id}` | Standard CRUD |

### 3. Backend Enhancements Needed

| Priority | Task | Description |
|----------|------|-------------|
| **High** | Authentication | Add JWT/session auth (User model exists but no auth endpoints). Protect all mutation endpoints. |
| **High** | Search endpoint | Add `GET /search?q=...` or add `?search=` query params to list endpoints for server-side filtering |
| **High** | Validation improvements | Add business rules: prevent deleting materials referenced by project items, validate status transitions |
| **Medium** | Pagination metadata | Return `{ items: [], total: int, page: int }` instead of bare arrays for proper frontend pagination |
| **Medium** | Estimate totals | Add computed `estimate_total` field to Project response (sum of all `line_subtotal` values) |
| **Medium** | Seed data script | Create a migration or seed script matching the frontend's hardcoded data for consistent dev experience |
| **Low** | Websocket updates | Real-time project updates when multiple users edit simultaneously |
| **Low** | File attachments | Support for blueprints/photos on projects and materials |
| **Low** | Audit log | Track who changed what and when for compliance |

### 4. Database

- **Engine**: PostgreSQL (via SQLAlchemy + Supabase)
- **Migration**: `supabase/migrations/20260301000000_create_initial_schema.sql` exists
- **Tables**: `users`, `customers`, `vendors`, `materials`, `projects`, `project_items`
- All tables use UUID primary keys and timezone-aware timestamps

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Styling | Tailwind CSS | v4 |
| Validation | Zod | 4.3.6 |
| Server State | TanStack Query | 5.x |
| Language | TypeScript | 5.x |
| Backend (existing) | FastAPI + SQLAlchemy | — |
| Database | PostgreSQL (Supabase) | — |
