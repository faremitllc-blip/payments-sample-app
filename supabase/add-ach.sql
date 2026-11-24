-- Run once in the Supabase SQL Editor. Safe to run again.
-- Links a Mondo user to their OwlPay Harbor customer (needed for US bank (ACH) top-ups).
create table if not exists public.ach_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_uuid text not null,
  created_at timestamptz not null default now()
);

alter table public.ach_customers enable row level security;
