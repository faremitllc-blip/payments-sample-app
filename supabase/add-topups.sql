-- Run once in the Supabase SQL Editor. Safe to run again.
-- Records each euro top-up started through open banking.
create table if not exists public.topups (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null default 'EUR',
  amount numeric not null,
  status text not null default 'waiting',
  webform_id text,
  payment_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists topups_user_idx on public.topups (user_id, created_at desc);

alter table public.topups enable row level security;
