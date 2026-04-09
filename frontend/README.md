# BuilderPro Frontend

Next.js 16 frontend for BuilderPro. This app is no longer a seed-data prototype: it is wired to the FastAPI backend through the typed client in `src/services/api.ts`.

## Requirements

- Node.js `>=20.9.0`
- npm
- Backend API available at `NEXT_PUBLIC_API_URL` or `http://localhost:8000/api`

The repo root includes `.nvmrc` with `20.9.0`.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Default app URL: `http://localhost:3000`

## Available Scripts

```bash
npm run dev
npm run lint
npm run build
npm run test:e2e
```

## Current Route Surface

- `/` dashboard with KPI cards, estimate trends, vendor spend summary, and alerts
- `/signin`, `/signup`, `/forgot-password`, `/join-invite` auth and onboarding flows
- `/materials` materials catalog with CSV import, price history, and attachments
- `/projects` project list with create, duplicate, and template actions
- `/projects/[id]` project detail with metadata editing, markup tracking, estimate export, and record builder
- `/projects/templates` reusable project templates
- `/orders` purchasing workflow, batch ordering, and tracking
- `/customers` customer CRUD
- `/vendors` vendor CRUD
- `/search` backend-powered search with filters
- `/settings` workspace admin, invites, members, workspace profile, billing summary, and audit activity

## Main Frontend Areas

- `app/` App Router entrypoints
- `src/components/` page-level UI and workflow components
- `src/hooks/useStore.tsx` live workspace store backed by the backend API
- `src/services/api.ts` typed API client
- `src/lib/auth.ts` frontend session handling
- `src/types/` shared frontend types and schemas
- `e2e/` Playwright coverage for core materials and project flows

## Notes

- `npm run build` will fail on older Node versions; Next.js 16 requires Node `>=20.9.0`.
- Backend pytest coverage exists under `../backend/tests`, but the backend Python environment must have `pytest` installed before those tests can run.
