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

-- Transactions: source-of-truth log of every buy/sell/dividend/split.
-- The holdings table acts as a snapshot for legacy data; once a ticker has
-- transactions, derive shares & cost basis from this log instead.
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  ticker          text not null,
  type            text not null check (type in ('buy', 'sell', 'dividend', 'split')),
  date            date not null default current_date,
  shares          numeric(20, 8) not null default 0,
  price_per_share numeric(20, 8) not null default 0,
  amount          numeric(20, 8) not null default 0,
  currency        text not null default 'USD',
  fees            numeric(20, 8) not null default 0,
  split_ratio     numeric(10, 4),
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_transactions_user_ticker_date
  on transactions(user_id, ticker, date);

alter table transactions enable row level security;

create policy "Users manage own transactions"
  on transactions for all
  using (auth.uid() = user_id);

-- Goals: target amount + date + monthly contribution for the projection page.
create table if not exists goals (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users not null,
  name                  text not null,
  target_amount         numeric(20, 2) not null,
  target_date           date not null,
  monthly_contribution  numeric(20, 2) not null default 0,
  expected_return_pct   numeric(6, 3) not null default 7.0,
  expected_volatility_pct numeric(6, 3) not null default 15.0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table goals enable row level security;

create policy "Users manage own goals"
  on goals for all
  using (auth.uid() = user_id);

-- Add tolerance band to existing target_allocations table (idempotent).
-- Default ±5% drift before flagging a position as out-of-band.
do $$ begin
  alter table target_allocations
    add column if not exists tolerance_pct numeric(6, 3) not null default 5.0;
exception when others then null; end $$;

-- Cash balances per user × currency. Rebalancer can pull from these to seed
-- the "new cash to deploy" input, and the dashboard total includes them.
create table if not exists cash_balances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  currency    text not null default 'USD',
  balance     numeric(20, 2) not null default 0,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, currency)
);

alter table cash_balances enable row level security;

create policy "Users manage own cash balances"
  on cash_balances for all
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
