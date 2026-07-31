-- Cue single use confirmation tokens
-- MCP Apps: the confirmation card can be double clicked or rendered twice, so a
-- confirm token must run its action at most once. Confirming claims the token's
-- jti here in one atomic insert; a second attempt finds the row and is refused.
-- Safe to re-run.

create table if not exists used_confirmations (
  jti text primary key,
  used_at timestamptz default now()
);

alter table used_confirmations enable row level security;
grant select, insert, update, delete on used_confirmations to service_role;
