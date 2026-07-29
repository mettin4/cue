-- Cue spending limits and debt tracking
-- Phase 4D: per account daily and monthly spending limits, and an informal ledger
-- of money owed between friends that never moves funds on its own. Safe to re-run.

-- Spending limits live on the account. Null means no limit. Enforced in the send
-- path, so every route that moves money is covered by the same check.
alter table users add column if not exists daily_limit_usdc numeric(18,6);
alter table users add column if not exists monthly_limit_usdc numeric(18,6);

-- Debts. A record of money owed in either direction, tracked without moving
-- anything. Settling is a separate, explicit step.
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references users(id),
  counterparty_name text,
  counterparty_email text,
  amount numeric(18,6) not null,
  direction text not null check (direction in ('they_owe','i_owe')),
  note text,
  status text not null check (status in ('open','settled')),
  created_at timestamptz default now(),
  settled_at timestamptz,
  last_reminded_at timestamptz
);

create index if not exists debts_account_idx on debts (account_id);
create index if not exists debts_account_status_idx on debts (account_id, status);

alter table debts enable row level security;
grant select, insert, update, delete on debts to service_role;
