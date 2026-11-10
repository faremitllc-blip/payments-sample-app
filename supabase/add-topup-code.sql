-- Run once in the Supabase SQL Editor. Safe to run again.
-- Adds the short code used in Mondo payment links (/pay/<code>).
alter table public.topups add column if not exists code text;
create unique index if not exists topups_code_idx on public.topups (code);
