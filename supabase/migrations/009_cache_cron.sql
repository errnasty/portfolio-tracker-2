-- ============================================================
-- Server-side price/FX cache + cron backbone (added 2026-07). The daily
-- cron (/api/cron/daily) warms these so prices, FX, recurring postings, CPF
-- contributions, and net-worth snapshots keep working even on days nobody
-- opens the app — previously all of that only ran client-side on load.
-- price_cache/fx_cache are also used as a fallback in /api/prices and
-- /api/fx when a live Yahoo/Frankfurter fetch fails, so a transient outage
-- shows a stale-but-real number instead of $0. Safe to re-run.
-- ============================================================

create table if not exists price_cache (
  ticker         text primary key,
  price          numeric not null,
  currency       text not null default 'USD',
  change         numeric default 0,
  change_percent numeric default 0,
  long_name      text,
  fetched_at     timestamptz not null default now()
);

alter table price_cache enable row level security;

-- Public market data (not per-user) — any signed-in user can read; only the
-- service role (used by the cron + /api/prices warm-up) writes.
drop policy if exists "Authenticated read price cache" on price_cache;
create policy "Authenticated read price cache"
  on price_cache for select
  using (auth.role() = 'authenticated');

create table if not exists fx_cache (
  base       text primary key,
  rates      jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table fx_cache enable row level security;

drop policy if exists "Authenticated read fx cache" on fx_cache;
create policy "Authenticated read fx cache"
  on fx_cache for select
  using (auth.role() = 'authenticated');

-- Realtime publication for bank_transactions, so the app can show
-- webhook-inserted transactions live instead of only on next refresh.
-- Guarded: no-ops if already added or if Realtime isn't enabled.
do $$ begin
  alter publication supabase_realtime add table bank_transactions;
exception when duplicate_object then null;
         when others then null; end $$;
