-- Backing store for the optional "share a log via an expiring link" feature.
--
-- You ONLY need this if you enable sharing (see README → "Sharing logs"). The app is
-- 100% client-side by default; with sharing off, nothing here is ever touched.
--
-- The app reaches this table EXCLUSIVELY through a server-side route handler
-- (app/api/share) using the Supabase service-role key. The browser never talks to
-- Supabase directly and never sees any Supabase credentials.
--
-- Run this once against your Supabase project (SQL editor) before enabling sharing.

create table if not exists public.obd_shares (
  id          text        primary key,            -- short random id used in the share URL
  payload     text        not null,               -- gzip(csv), base64-encoded
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null                -- reads filter on this; expired rows are never served
);

-- Reads always filter on expires_at, so index it.
create index if not exists obd_shares_expires_at_idx on public.obd_shares (expires_at);

-- Lock the table down. The service-role key (used only by the server route) BYPASSES
-- RLS, so enabling RLS with NO anon/authenticated policies means that even if your
-- public anon key leaked, it still could not read or write shared logs directly.
alter table public.obd_shares enable row level security;

-- Optional housekeeping: physically delete expired rows. Expired rows are already
-- filtered out on read, so this is purely to reclaim space. If you have pg_cron:
--
--   select cron.schedule(
--     'obd-shares-cleanup', '0 * * * *',
--     $$ delete from public.obd_shares where expires_at < now() $$
--   );
--
-- Otherwise run this manually now and then:
--   delete from public.obd_shares where expires_at < now();
