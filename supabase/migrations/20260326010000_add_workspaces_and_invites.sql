-- =====================================================
-- WORKSPACES
-- =====================================================
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

-- =====================================================
-- WORKSPACE MEMBERS
-- =====================================================
create table if not exists workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          text not null default 'user' check (role in ('admin', 'user')),
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- =====================================================
-- WORKSPACE INVITES
-- =====================================================
create table if not exists workspace_invites (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  invited_email       text not null,
  invite_token        text not null unique,
  invited_by_user_id  uuid not null references users(id),
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  accepted_by_user_id uuid references users(id),
  created_at          timestamptz not null default now()
);

-- =====================================================
-- INDEXES
-- =====================================================
create index if not exists idx_workspaces_created_by on workspaces(created_by);
create index if not exists idx_workspace_members_workspace on workspace_members(workspace_id);
create index if not exists idx_workspace_members_user on workspace_members(user_id);
create index if not exists idx_workspace_invites_workspace on workspace_invites(workspace_id);
create index if not exists idx_workspace_invites_email on workspace_invites(invited_email);
create index if not exists idx_workspace_invites_expires_at on workspace_invites(expires_at);
