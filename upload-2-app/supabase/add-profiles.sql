-- Run ONCE in the Supabase SQL Editor (New query -> paste -> Run) before using
-- the Profile page. It only adds one table and does not touch anything else.
-- Safe to run again.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- A small square JPEG (256 x 256), stored as a data URL.
  avatar text,
  updated_at timestamptz not null default now()
);

-- Same as the other tables: browsers cannot read it directly. They go through
-- the app's own routes, which check who is signed in.
alter table public.profiles enable row level security;
