-- Run once in the Supabase SQL Editor. Safe to run again.
-- USDC that a user has set aside in a currency wallet, and a log of each move.
create table if not exists public.currency_pockets (
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null,
  usdc numeric not null default 0 check (usdc >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, currency)
);

create table if not exists public.pocket_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null,
  direction text not null check (direction in ('in', 'out')),
  source text not null,
  usdc numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists pocket_moves_user_idx on public.pocket_moves (user_id, created_at desc);

alter table public.currency_pockets enable row level security;
alter table public.pocket_moves enable row level security;
