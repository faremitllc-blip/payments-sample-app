-- Run once in the Supabase SQL Editor. Safe to run again.
-- Lets a top-up record that it was paid by card, and the USDC sent for it.
alter table public.topups add column if not exists method text;
alter table public.topups add column if not exists usdc_amount numeric;
alter table public.topups add column if not exists usdc_tx text;
