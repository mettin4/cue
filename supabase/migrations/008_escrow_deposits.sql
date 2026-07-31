-- Cue phase 7: on-chain escrow (CueEscrow on Arc testnet).
-- Tracks deposits locked in the escrow contract. The default send path is
-- unchanged; this backs the demonstrated escrow alternative. Idempotent.

create table if not exists escrow_deposits (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references users(id),
  recipient_email text not null,
  amount_usdc numeric(18,6) not null,
  -- The claim token whose keccak256 is the on-chain recipient identifier. The
  -- contract never sees the token, only its hash.
  claim_token text unique not null,
  recipient_hash text not null,
  -- Deposit id assigned by the contract, read back from the Locked event.
  onchain_id bigint not null,
  unlock_at timestamptz not null,
  status text not null check (status in ('locked','reclaimed','withdrawn','failed')),
  lock_tx text,
  reclaim_tx text,
  withdraw_tx text,
  created_at timestamptz default now(),
  settled_at timestamptz
);

create index if not exists escrow_deposits_sender_idx on escrow_deposits (sender_id);

alter table escrow_deposits enable row level security;
