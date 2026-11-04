-- Run once in the Supabase SQL Editor. Safe to run again.
-- Adds photos, a build stage and a stage history to listed properties, and a
-- public storage bucket for the photos.

alter table public.properties add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.properties add column if not exists stage text not null default '';
alter table public.properties add column if not exists stage_log jsonb not null default '[]'::jsonb;

-- Photos are public to view (they are shown on the listing). Only the server,
-- using the service role key, can add or remove them.
insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do update set public = true;
