-- Cue connect tokens
-- Phase 4B remote MCP: each user gets a long random token that maps a personal
-- connect URL to their account. The acting user is resolved from the token on
-- every request and never from client input. Safe to re-run.

create table if not exists connect_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token text unique not null,
  label text,
  created_at timestamptz default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- token has a unique index from the constraint above. Add a lookup by user for
-- the dashboard, and a partial index for the active token per user.
create index if not exists connect_tokens_user_idx
  on connect_tokens (user_id);

create index if not exists connect_tokens_active_idx
  on connect_tokens (user_id)
  where revoked_at is null;

alter table connect_tokens enable row level security;

grant select, insert, update, delete on connect_tokens to service_role;
