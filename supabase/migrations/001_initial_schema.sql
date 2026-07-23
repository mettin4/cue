-- Cue initial schema
-- Phase 2: users, transactions, scheduled payments, email logs.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.

-- Users of the app. One row per email address.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  circle_wallet_id text,
  circle_wallet_address text,
  created_at timestamptz default now()
);

-- Outbound payments. A transaction is created in 'pending_claim' and moves to
-- 'claimed', 'cancelled' or 'failed'.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references users(id),
  recipient_email text not null,
  amount_usdc numeric(18,6) not null,
  status text not null check (status in ('pending_claim','claimed','cancelled','failed')),
  circle_tx_id text,
  claim_token text unique,
  cancel_deadline timestamptz,
  created_at timestamptz default now(),
  claimed_at timestamptz
);

-- Recurring payments. day_of_month caps at 28 so every month has that day.
create table if not exists scheduled_payments (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references users(id),
  recipient_email text not null,
  amount_usdc numeric(18,6) not null,
  day_of_month int not null check (day_of_month between 1 and 28),
  active boolean default true,
  last_run_at timestamptz,
  created_at timestamptz default now()
);

-- Audit trail of every email Resend sends for a transaction.
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  type text not null,
  sent_at timestamptz default now(),
  resend_id text
);

-- Indexes.
-- transactions.claim_token is already backed by an index: the UNIQUE constraint
-- above creates one implicitly, so a second btree index would be dead weight.
create index if not exists transactions_sender_id_idx
  on transactions (sender_id);

create index if not exists scheduled_payments_active_day_idx
  on scheduled_payments (active, day_of_month);

-- Row level security.
-- Enabled on every table with no policies attached, so anon and authenticated
-- roles are denied by default. All server access goes through the service role
-- key, which bypasses RLS.
alter table users enable row level security;
alter table transactions enable row level security;
alter table scheduled_payments enable row level security;
alter table email_logs enable row level security;

-- Privileges.
-- Tables created over a direct Postgres connection do not pick up the grants
-- PostgREST needs, so grant them explicitly to service_role. Only service_role
-- is granted: anon and authenticated stay unprivileged, and RLS above denies
-- them anyway since no policies are attached.
grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
