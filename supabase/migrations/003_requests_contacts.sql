-- Cue requests and contacts
-- Phase 4B: money requests (the reverse of a send) and a personal contact book
-- so people can be named instead of typed as an email every time. Safe to re-run.

-- Money requests. A request is created 'pending' and moves to 'paid' when the
-- target pays, 'cancelled' if the requester calls it off, or 'expired'. Paying a
-- request creates an ordinary send from the payer to the requester, so no money
-- moves until then.
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id),
  target_email text not null,
  amount numeric(18,6) not null,
  status text not null check (status in ('pending','paid','cancelled','expired')),
  pay_token text unique,
  created_at timestamptz default now(),
  paid_at timestamptz
);

create index if not exists requests_requester_idx on requests (requester_id);
create index if not exists requests_target_idx on requests (target_email);

-- A personal contact book, one set per account. A name maps to an email so a
-- person can say "pay Alex" instead of typing the address every time.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- One name per account, matched case insensitively, so saving the same name
-- again updates the address rather than creating a duplicate.
create unique index if not exists contacts_user_name_idx
  on contacts (user_id, lower(name));

create index if not exists contacts_user_idx on contacts (user_id);

-- Row level security, denied by default. All access goes through the service
-- role, which bypasses RLS, matching every other table.
alter table requests enable row level security;
alter table contacts enable row level security;

grant select, insert, update, delete on requests to service_role;
grant select, insert, update, delete on contacts to service_role;
