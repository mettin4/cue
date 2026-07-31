-- Cue phase 6: test funds.
-- Marks how a transactions row came to be, so a top up from the shared demo
-- pool reads as "funds added" rather than money received from a person. Old
-- rows default to 'transfer'. Idempotent: safe to re-run.

alter table transactions
  add column if not exists kind text not null default 'transfer';

-- Sum and cooldown lookups for the per account cap read funding rows by
-- recipient, so index that pair.
create index if not exists transactions_kind_recipient_idx
  on transactions (kind, recipient_email);
