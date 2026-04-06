-- =====================================================
-- PHASE 1: ADD WORKSPACE ID TO CORE BUSINESS TABLES
-- Safe expand migration: nullable columns first, constraints enforced later.
-- =====================================================

alter table if exists customers
  add column if not exists workspace_id uuid references workspaces(id);

alter table if exists vendors
  add column if not exists workspace_id uuid references workspaces(id);

alter table if exists materials
  add column if not exists workspace_id uuid references workspaces(id);

alter table if exists projects
  add column if not exists workspace_id uuid references workspaces(id);

alter table if exists project_items
  add column if not exists workspace_id uuid references workspaces(id);

-- =====================================================
-- INDEXES FOR WORKSPACE-SCOPED QUERIES
-- =====================================================
create index if not exists idx_customers_workspace on customers(workspace_id);
create index if not exists idx_vendors_workspace on vendors(workspace_id);
create index if not exists idx_materials_workspace on materials(workspace_id);
create index if not exists idx_projects_workspace on projects(workspace_id);
create index if not exists idx_project_items_workspace on project_items(workspace_id);

create index if not exists idx_projects_workspace_status on projects(workspace_id, status);
create index if not exists idx_materials_workspace_category on materials(workspace_id, category);
create index if not exists idx_project_items_workspace_project on project_items(workspace_id, project_id);
