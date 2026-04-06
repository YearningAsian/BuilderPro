-- =====================================================
-- PHASE 4: STRICT WORKSPACE ENFORCEMENT
-- Backfill any remaining resolvable rows, then enforce NOT NULL and
-- workspace-scoped uniqueness rules for multi-tenant safety.
-- =====================================================

-- -----------------------------------------------------
-- Best-effort final backfill for any still-null workspace IDs
-- -----------------------------------------------------
with resolved_project_workspaces as (
  select
    p.id as project_id,
    (
      select wm.workspace_id
      from workspace_members wm
      where wm.user_id = p.created_by
      order by wm.created_at asc, wm.id asc
      limit 1
    ) as workspace_id
  from projects p
  where p.workspace_id is null
)
update projects p
set workspace_id = resolved.workspace_id
from resolved_project_workspaces resolved
where p.id = resolved.project_id
  and resolved.workspace_id is not null;

update project_items pi
set workspace_id = p.workspace_id
from projects p
where pi.project_id = p.id
  and pi.workspace_id is null
  and p.workspace_id is not null;

update customers c
set workspace_id = inferred.workspace_id
from (
  select p.customer_id, min(p.workspace_id::text)::uuid as workspace_id
  from projects p
  where p.customer_id is not null
    and p.workspace_id is not null
  group by p.customer_id
  having count(distinct p.workspace_id) = 1
) inferred
where c.id = inferred.customer_id
  and c.workspace_id is null;

update materials m
set workspace_id = inferred.workspace_id
from (
  select pi.material_id, min(pi.workspace_id::text)::uuid as workspace_id
  from project_items pi
  where pi.material_id is not null
    and pi.workspace_id is not null
  group by pi.material_id
  having count(distinct pi.workspace_id) = 1
) inferred
where m.id = inferred.material_id
  and m.workspace_id is null;

update vendors v
set workspace_id = inferred.workspace_id
from (
  select m.default_vendor_id as vendor_id, min(m.workspace_id::text)::uuid as workspace_id
  from materials m
  where m.default_vendor_id is not null
    and m.workspace_id is not null
  group by m.default_vendor_id
  having count(distinct m.workspace_id) = 1
) inferred
where v.id = inferred.vendor_id
  and v.workspace_id is null;

-- -----------------------------------------------------
-- Refuse to proceed if unresolved nulls remain
-- -----------------------------------------------------
do $$
begin
  if exists (select 1 from customers where workspace_id is null) then
    raise exception 'Cannot enforce customers.workspace_id NOT NULL: unresolved rows remain';
  end if;

  if exists (select 1 from vendors where workspace_id is null) then
    raise exception 'Cannot enforce vendors.workspace_id NOT NULL: unresolved rows remain';
  end if;

  if exists (select 1 from materials where workspace_id is null) then
    raise exception 'Cannot enforce materials.workspace_id NOT NULL: unresolved rows remain';
  end if;

  if exists (select 1 from projects where workspace_id is null) then
    raise exception 'Cannot enforce projects.workspace_id NOT NULL: unresolved rows remain';
  end if;

  if exists (select 1 from project_items where workspace_id is null) then
    raise exception 'Cannot enforce project_items.workspace_id NOT NULL: unresolved rows remain';
  end if;
end $$;

-- -----------------------------------------------------
-- Enforce NOT NULL workspace ownership
-- -----------------------------------------------------
alter table customers
  alter column workspace_id set not null;

alter table vendors
  alter column workspace_id set not null;

alter table materials
  alter column workspace_id set not null;

alter table projects
  alter column workspace_id set not null;

alter table project_items
  alter column workspace_id set not null;

-- -----------------------------------------------------
-- Replace old global uniqueness with workspace-scoped rules
-- -----------------------------------------------------
alter table vendors
  drop constraint if exists vendors_name_key;

alter table materials
  drop constraint if exists materials_sku_key;

do $$
begin
  if exists (
    select 1
    from (
      select workspace_id, lower(name), count(*)
      from vendors
      group by workspace_id, lower(name)
      having count(*) > 1
    ) dup
  ) then
    raise exception 'Cannot enforce workspace-scoped vendor uniqueness: duplicate vendor names exist within a workspace';
  end if;

  if exists (
    select 1
    from (
      select workspace_id, sku, count(*)
      from materials
      where sku is not null
      group by workspace_id, sku
      having count(*) > 1
    ) dup
  ) then
    raise exception 'Cannot enforce workspace-scoped material SKU uniqueness: duplicate SKUs exist within a workspace';
  end if;
end $$;

create unique index if not exists uq_vendors_workspace_name
  on vendors(workspace_id, lower(name));

create unique index if not exists uq_materials_workspace_sku
  on materials(workspace_id, sku)
  where sku is not null;
