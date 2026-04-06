# BuilderPro `workspace_id` Migration Plan

Date: 2026-04-06
Status: Draft plan ready for implementation review

---

## Goal
Move BuilderPro from **owner-scoped fallback security** to **real workspace-level multi-tenant isolation**.

Today, `workspaces` and `workspace_members` exist, but the main business tables still do **not** carry `workspace_id`. That means the app cannot fully isolate `customers`, `vendors`, `materials`, `projects`, and `orders` by workspace at the database level.

---

## Current gap confirmed
The current schema files show:
- `supabase/migrations/20260301000000_create_initial_schema.sql`
- `supabase/migrations/20260326010000_add_workspaces_and_invites.sql`

These tables currently **lack `workspace_id`**:
- `customers`
- `vendors`
- `materials`
- `projects`
- `project_items`

This is why the recent safety fix only owner-scopes `projects` and `orders` in the backend.

---

## Target schema

| Table | Add `workspace_id` | Final rule |
|---|---|---|
| `customers` | yes | every customer belongs to exactly one workspace |
| `vendors` | yes | every vendor belongs to exactly one workspace |
| `materials` | yes | every material belongs to exactly one workspace |
| `projects` | yes | every project belongs to exactly one workspace |
| `project_items` | yes | every line item belongs to exactly one workspace and matches its parent project |

### Constraints/indexes to add
- foreign key: `workspace_id references workspaces(id)`
- index on each new `workspace_id`
- composite indexes for common filters such as:
  - `projects(workspace_id, status)`
  - `materials(workspace_id, category)`
  - `project_items(workspace_id, project_id)`
- replace global uniqueness with workspace-scoped uniqueness where needed:
  - `vendors.name` → unique per workspace instead of global
  - `materials.sku` → unique per workspace when not null instead of global

---

## Recommended rollout strategy
Use an **expand -> backfill -> enforce** rollout.

### Phase 1 — Preflight audit
Before touching production data, run a dry audit to find shared rows that cannot be auto-assigned safely.

#### Audit queries to run
1. Projects with no creator:
```sql
select id, name, created_by
from projects
where created_by is null;
```

2. Projects whose creator has no workspace membership:
```sql
select p.id, p.name, p.created_by
from projects p
left join workspace_members wm on wm.user_id = p.created_by
where p.created_by is not null
group by p.id, p.name, p.created_by
having count(wm.id) = 0;
```

3. Customers referenced by projects from multiple workspaces:
```sql
select p.customer_id, count(distinct wm.workspace_id) as workspace_count
from projects p
join workspace_members wm on wm.user_id = p.created_by
where p.customer_id is not null
group by p.customer_id
having count(distinct wm.workspace_id) > 1;
```

4. Materials referenced by project items from multiple workspaces:
```sql
select pi.material_id, count(distinct wm.workspace_id) as workspace_count
from project_items pi
join projects p on p.id = pi.project_id
join workspace_members wm on wm.user_id = p.created_by
group by pi.material_id
having count(distinct wm.workspace_id) > 1;
```

5. Vendors referenced by materials from multiple future workspaces:
```sql
select m.default_vendor_id, count(distinct p.created_by) as owner_count
from materials m
left join project_items pi on pi.material_id = m.id
left join projects p on p.id = pi.project_id
where m.default_vendor_id is not null
group by m.default_vendor_id
having count(distinct p.created_by) > 1;
```

> If any of these queries return rows, those records need review or duplication during backfill.

---

### Phase 2 — Expand migration (safe, nullable columns)
Create a new migration file, for example:
- `supabase/migrations/20260406010000_add_workspace_id_to_business_tables.sql`

This migration should:

```sql
alter table customers add column if not exists workspace_id uuid references workspaces(id);
alter table vendors add column if not exists workspace_id uuid references workspaces(id);
alter table materials add column if not exists workspace_id uuid references workspaces(id);
alter table projects add column if not exists workspace_id uuid references workspaces(id);
alter table project_items add column if not exists workspace_id uuid references workspaces(id);

create index if not exists idx_customers_workspace on customers(workspace_id);
create index if not exists idx_vendors_workspace on vendors(workspace_id);
create index if not exists idx_materials_workspace on materials(workspace_id);
create index if not exists idx_projects_workspace on projects(workspace_id);
create index if not exists idx_project_items_workspace on project_items(workspace_id);
create index if not exists idx_projects_workspace_status on projects(workspace_id, status);
create index if not exists idx_materials_workspace_category on materials(workspace_id, category);
create index if not exists idx_project_items_workspace_project on project_items(workspace_id, project_id);
```

At this stage, keep the columns **nullable** so the app can deploy without downtime.

---

### Phase 3 — Backfill existing rows

#### 3.1 Backfill `projects.workspace_id`
Primary rule:
- derive from `projects.created_by -> workspace_members.workspace_id`
- if a user has multiple memberships, use the earliest/admin membership chosen by the auth/session resolver

Suggested SQL pattern:
```sql
update projects p
set workspace_id = wm.workspace_id
from workspace_members wm
where p.created_by = wm.user_id
  and p.workspace_id is null;
```

#### 3.2 Backfill `project_items.workspace_id`
Derive directly from the parent project:
```sql
update project_items pi
set workspace_id = p.workspace_id
from projects p
where pi.project_id = p.id
  and pi.workspace_id is null;
```

#### 3.3 Backfill `customers.workspace_id`
Rule:
- if a customer is only referenced by projects from one workspace, assign that workspace
- if a customer is referenced by multiple workspaces, **duplicate the customer row per workspace** and repoint projects

#### 3.4 Backfill `materials.workspace_id`
Rule:
- if a material is only used by one workspace, assign that workspace
- if it is shared across multiple workspaces, **duplicate the material row per workspace** and repoint affected `project_items`

#### 3.5 Backfill `vendors.workspace_id`
Rule:
- if a vendor is only used by materials in one workspace, assign that workspace
- if shared, **duplicate vendor rows per workspace** and repoint `materials.default_vendor_id`

---

## Data conflict policy
Use this policy during the backfill script or migration support script.

| Conflict | Safe action |
|---|---|
| project has no creator | assign via manual review or admin-owned default workspace |
| customer used by multiple workspaces | duplicate customer and repoint each workspace’s projects |
| material used by multiple workspaces | duplicate material and repoint each workspace’s project items |
| vendor used by multiple workspaces | duplicate vendor and repoint materials |
| row has no usage history | assign to creator’s workspace or mark for manual cleanup |

> Do **not** silently assign shared business rows to only one workspace; that would leak or orphan tenant data.

---

## Phase 4 — Application changes after backfill
Once all rows have a `workspace_id`, update the app code to stop relying on `created_by` fallback.

### Backend updates
Update:
- `backend/app/models/models.py`
- `backend/app/schemas/schemas.py`
- `backend/app/api/projects.py`
- `backend/app/api/materials.py`
- `backend/app/api/customers.py`
- `backend/app/api/vendors.py`
- `backend/app/api/orders.py`

New behavior:
- resolve the user’s active workspace from auth/session
- filter all list/detail queries by `workspace_id`
- stamp `workspace_id` automatically on create
- reject cross-workspace references
  - project cannot point to a customer from another workspace
  - material cannot point to a vendor from another workspace
  - project item cannot use a material from another workspace

### Frontend updates
Update:
- `frontend/src/lib/auth.ts`
- `frontend/src/services/api.ts`
- `frontend/src/hooks/useStore.tsx`
- relevant pages/forms using customer/material/vendor/project creates

New behavior:
- use the session’s `workspaceId` as the active tenant context
- remove remaining prototype assumptions
- later add workspace switching only if multi-workspace membership is truly needed in the UI

---

## Phase 5 — Enforce constraints
After backfill and app rollout are confirmed, run a follow-up migration to make the design strict.

### Enforce NOT NULL
```sql
alter table customers alter column workspace_id set not null;
alter table vendors alter column workspace_id set not null;
alter table materials alter column workspace_id set not null;
alter table projects alter column workspace_id set not null;
alter table project_items alter column workspace_id set not null;
```

### Replace global uniqueness with workspace-scoped uniqueness
Suggested final indexes:
```sql
create unique index if not exists uq_vendors_workspace_name
  on vendors(workspace_id, lower(name));

create unique index if not exists uq_materials_workspace_sku
  on materials(workspace_id, sku)
  where sku is not null;
```

Then remove any old global uniqueness that blocks legitimate per-workspace duplicates.

---

## Verification checklist
After implementation, verify with evidence:

### Database checks
- no null `workspace_id` values remain
- no cross-workspace project/customer/material references remain
- duplicate resolution completed where required

### Backend checks
Run:
```bash
cd backend
./.venv/Scripts/python.exe -m unittest tests.test_auth_workspace_recovery
./.venv/Scripts/python.exe -m compileall app
```

Add/verify tests for:
- project list returns only active workspace data
- customers/vendors/materials are workspace-filtered
- create endpoints stamp `workspace_id`
- cross-workspace references are rejected with 403/404

### Frontend checks
Run:
```bash
cd frontend
npm run build
```

Manual checks:
- sign in as two users in different workspaces
- confirm each sees only their own customers, vendors, materials, projects, and orders
- create records in workspace A and confirm they never appear in workspace B

---

## Rollback plan
If issues appear during rollout:
1. stop the app deploy that assumes non-null `workspace_id`
2. keep the expand migration in place (nullable columns are safe)
3. revert filtering code to interim owner-scoped behavior
4. fix the backfill script and retry before enforcing `NOT NULL`

This is why the rollout should be done in **two migrations**, not one big irreversible step.

---

## Recommended next implementation step
The safest next step is:

1. create the **expand migration** file with nullable `workspace_id` columns and indexes
2. update SQLAlchemy models to mirror those columns
3. write a backfill helper script for conflict reporting before enforcing constraints

That keeps the change small, reviewable, and aligned with the current BuilderPro instructions.
