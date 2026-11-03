-- Run once in the Supabase SQL Editor. Safe to run again.
-- Adds the tables for pooled property investments.

-- What people see about each property. The money and ownership live in the smart
-- contract; this table holds the description and links it to the contract's id.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  onchain_id bigint not null unique,
  title text not null,
  location text not null default '',
  description text not null default '',
  image_url text not null default '',
  expected_return text not null default '',
  min_invest_usdc numeric not null default 10,
  created_at timestamptz not null default now()
);

-- Each investment a user makes through the app, with its progress.
create table if not exists public.property_investments (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  amount text not null,
  status text not null default 'running',
  state jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_investments_user_idx
  on public.property_investments (user_id, created_at desc);
create index if not exists property_investments_property_idx
  on public.property_investments (property_id);

alter table public.properties enable row level security;
alter table public.property_investments enable row level security;
