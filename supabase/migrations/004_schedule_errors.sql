-- Cue scheduled payment failures
-- Phase 4C: the runner records why a scheduled payment could not go out, so a
-- failure is durable and can be shown, not only emailed. Safe to re-run.

alter table scheduled_payments
  add column if not exists last_error text;

alter table scheduled_payments
  add column if not exists last_failed_at timestamptz;
