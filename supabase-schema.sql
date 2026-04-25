-- ============================================================
-- Portfolio Tracker — Supabase Schema
-- Run this in your Supabase project SQL editor
-- ============================================================

-- Holdings: your stock/ETF positions
create table if not exists holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  ticker        text not null,
  name          text,
  shares        numeric(20, 6) not null,
  cost_basis_per_share numeric(20, 6) not null,
  cost_basis_currency  text not null default 'USD',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table holdings enable row level security;

create policy "Users manage own holdings"
  on holdings for all
  using (auth.uid() = user_id);

-- Target allocations for the rebalancer
create table if not exists target_allocations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  ticker     text not null,
  target_pct numeric(10, 4) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, ticker)
);

alter table target_allocations enable row level security;

create policy "Users manage own target allocations"
  on target_allocations for all
  using (auth.uid() = user_id);

-- User settings (base display currency, etc.)
create table if not exists user_settings (
  user_id       uuid primary key references auth.users,
  base_currency text not null default 'USD',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table user_settings enable row level security;

create policy "Users manage own settings"
  on user_settings for all
  using (auth.uid() = user_id);

-- ETF / ticker composition cache (public reference data — no per-user rows)
-- Holds dynamically-fetched country/sector breakdowns + top holdings so we
-- don't hammer Yahoo on every page load. TTL is enforced in the API route.
create table if not exists etf_composition_cache (
  ticker      text primary key,
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table etf_composition_cache enable row level security;

-- Public reference data — any authenticated user can read, and any user
-- can populate the cache (data is non-sensitive market metadata).
create policy "Anyone can read composition cache"
  on etf_composition_cache for select
  using (true);

create policy "Anyone can insert composition cache"
  on etf_composition_cache for insert
  with check (true);

create policy "Anyone can update composition cache"
  on etf_composition_cache for update
  using (true);
