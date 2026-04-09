# BuilderPro Explained

## Project Goal
BuilderPro is a construction operations app focused on one core outcome: help a company create reliable estimates and manage purchasing inside a shared workspace.

The platform is built to:
1. Keep a clean source of truth for materials, vendors, customers, and projects.
2. Turn project requirements into estimate line items with repeatable math.
3. Support multi-user collaboration with workspace-level access control.
4. Provide a production-ready API and schema foundation for future expansion (reporting, exports, deeper procurement workflows).

## What the System Includes
BuilderPro is a full-stack app with three main layers:
1. Frontend: Next.js 16 + React 19 + TypeScript in frontend.
2. Backend: FastAPI + SQLAlchemy in backend.
3. Database: Postgres/Supabase schema managed through SQL migrations in supabase/migrations.

## How It Works End to End
1. User signs in or signs up through frontend auth pages.
2. Frontend stores session and calls backend APIs using Authorization bearer tokens.
3. Backend resolves the current user and active workspace from auth context.
4. Every business query is workspace-scoped (materials, customers, vendors, projects, project items).
5. Frontend renders live data and updates local UI state after API writes.

## Frontend Architecture (frontend)
The frontend uses the App Router and is organized by business area.

Main routes:
1. app/signin, app/signup, app/join-invite, app/forgot-password for auth flows.
2. app/projects, app/materials, app/vendors, app/customers, app/orders, app/settings for business workflows.
3. app/search for global lookup.

Key implementation pieces:
1. src/services/api.ts is the type-safe API client for backend endpoints under /api.
2. src/hooks/useStore.tsx is the app store/provider. It now performs live API reads and writes (not seed-only behavior).
3. Session helpers in src/lib/auth drive auth headers and session-expiry handling.

## Backend Architecture (backend)
FastAPI app entrypoint: app/main.py.

Registered route groups:
1. /api/auth: sign-in/sign-out, signup, invite flow, workspace members, audit log.
2. /api/materials: workspace-scoped material CRUD.
3. /api/customers: workspace-scoped customer CRUD.
4. /api/vendors: workspace-scoped vendor CRUD.
5. /api/projects: workspace-scoped project CRUD and project line-item creation.
6. /api/orders: project item CRUD, bulk order status updates, vendor PO HTML generation.

Operational endpoints:
1. /health for service health.
2. /health/db for DB connectivity validation.

## Auth and Workspace Model
Auth is integrated with Supabase Auth on the backend.

Important behavior:
1. Signup can create company/workspace context and membership.
2. Invite flow supports workspace onboarding with token-based join.
3. Membership roles are admin/user.
4. Legacy admin recovery logic can auto-repair missing workspace memberships.
5. Local auth fallback can issue a dev token when Supabase rate-limits during local testing (controlled by ENABLE_LOCAL_AUTH_FALLBACK).

## Data Model and Business Rules
Core entities:
1. users
2. workspaces
3. workspace_members
4. workspace_invites
5. audit_logs
6. customers
7. vendors
8. materials
9. projects
10. project_items

Key rules enforced in models and schemas:
1. Non-negative numeric constraints for costs and percentages.
2. Positive quantity checks for project items.
3. Enumerated status fields (project status and order status).
4. Workspace-scoped uniqueness (for example vendor names and material SKU scope).

## Estimate and Purchasing Logic
For project items, totals are computed and stored at write time:
1. total_qty = quantity * (1 + waste_pct / 100)
2. line_subtotal = total_qty * unit_cost

Why this matters:
1. Item rows keep price and quantity snapshots tied to the project timeline.
2. Later changes to a material record do not silently rewrite historical estimate values.

Order workflow includes:
1. Status transitions: draft, ordered, received, cancelled.
2. Timestamp handling for ordered_at and received_at.
3. Bulk status update by vendor.
4. Generated vendor purchase-order HTML (print/save as PDF flow).

## Runtime and Local Development
Primary startup script: run-all.sh.

What it does:
1. Ensures backend venv and frontend node_modules exist.
2. Installs dependencies when lock/requirements change.
3. Starts backend (default 8000) and frontend (default 3500).
4. Provides SQLite fallback only when no backend DB config is present.
5. Sets frontend API URL and allowed origins for local cross-origin requests.

## Current Project State
Already strong:
1. Clear API boundaries and typed frontend client.
2. Workspace-safe data scoping across resources.
3. Invite/member/audit infrastructure.
4. Migration-first database approach.

Still evolving:
1. Frontend UX and screens can continue to mature (especially team management/admin tooling).
2. Test coverage is growing but not yet broad across all modules.
3. Additional reporting/export workflows are natural next product steps.

## In One Line
BuilderPro is a workspace-aware construction estimating and purchasing platform that is moving from a solid operational core to a more complete production product experience.
