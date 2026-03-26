-- =====================================================
-- USERS & AUTHENTICATION
-- =====================================================
create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  full_name   text,
  role        text not null default 'user' check (role in ('admin', 'user')),
  created_at  timestamptz not null default now()
);

-- =====================================================
-- CUSTOMERS & VENDORS
-- =====================================================
create table customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- =====================================================
-- MATERIALS INVENTORY
-- =====================================================
create table materials (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  category          text,
  unit_type         text not null,                  -- each/ft/sqft/cuyd/etc
  unit_cost         numeric(12,2) not null check (unit_cost >= 0),
  sku               text unique,
  default_vendor_id uuid references vendors(id),
  size_dims         text,
  notes             text,
  is_taxable        boolean not null default true,
  default_waste_pct numeric(5,2) not null default 0 check (default_waste_pct >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =====================================================
-- PROJECTS
-- =====================================================
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  customer_id        uuid not null references customers(id),
  status             text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  default_tax_pct    numeric(5,2) not null default 0 check (default_tax_pct >= 0),
  default_waste_pct  numeric(5,2) not null default 0 check (default_waste_pct >= 0),
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- =====================================================
-- PROJECT LINE ITEMS
-- =====================================================
create table project_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  material_id   uuid not null references materials(id) on delete restrict,
  
  quantity      numeric(12,3) not null check (quantity > 0),
  
  -- Snapshot fields (estimates don't change if material price changes later)
  unit_type     text not null,
  unit_cost     numeric(12,2) not null check (unit_cost >= 0),
  waste_pct     numeric(5,2) not null default 0 check (waste_pct >= 0),
  
  -- Computed fields (for reporting performance)
  total_qty     numeric(12,3) not null,            -- quantity * (1 + waste_pct/100)
  line_subtotal numeric(12,2) not null,            -- total_qty * unit_cost
  
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =====================================================
-- INDEXES  (added 2026-03-26 for query performance)
-- =====================================================
create index idx_materials_category    on materials(category);
create index idx_materials_vendor      on materials(default_vendor_id);
create index idx_projects_customer     on projects(customer_id);
create index idx_projects_status       on projects(status);
create index idx_projects_created_by   on projects(created_by);
create index idx_project_items_project  on project_items(project_id);
create index idx_project_items_material on project_items(material_id);
