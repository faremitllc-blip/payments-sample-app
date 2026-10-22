-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again. It adds the tables for bridging USDC between networks.

-- One extra Circle wallet per user per network (the main wallet stays in "wallets").
create table if not exists public.network_wallets (
  user_id uuid not null references auth.users (id) on delete cascade,
  blockchain text not null,
  circle_wallet_id text not null unique,
  address text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, blockchain)
);

-- Every bridge the user starts, with its progress.
create table if not exists public.bridge_transfers (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_chain text not null,
  to_chain text not null,
  amount text not null,
  status text not null default 'running',
  steps jsonb not null default '[]'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_transfers_user_idx
  on public.bridge_transfers (user_id, created_at desc);

-- Lock both tables. Only the server (service role key) can use them.
alter table public.network_wallets enable row level security;
alter table public.bridge_transfers enable row level security;
