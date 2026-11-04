-- Run once in the Supabase SQL Editor. Safe to run again.
-- (Same two lines as at the end of add-property-media.sql.)
alter table public.properties add column if not exists max_invest_usdc numeric;
alter table public.properties add column if not exists property_price_usdc numeric;
