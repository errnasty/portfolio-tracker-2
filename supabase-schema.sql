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

drop policy if exists "Users manage own holdings" on holdings;
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

drop policy if exists "Users manage own target allocations" on target_allocations;
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

drop policy if exists "Users manage own settings" on user_settings;
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

drop policy if exists "Users manage own transactions" on transactions;
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

drop policy if exists "Users manage own goals" on goals;
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

-- Idempotent guards in case an older version of this table exists without
-- the latest columns / unique constraint / RLS. Safe to re-run.
do $$ begin
  alter table cash_balances add column if not exists notes text;
exception when others then null; end $$;

do $$ begin
  alter table cash_balances
    add constraint cash_balances_user_currency_key unique (user_id, currency);
exception when duplicate_table then null;
         when duplicate_object then null;
         when others then null; end $$;

alter table cash_balances enable row level security;

drop policy if exists "Users manage own cash balances" on cash_balances;
create policy "Users manage own cash balances"
  on cash_balances for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Personal finance hub: accounts, categories, bank/spending ledger
-- ============================================================

-- Accounts: unified store for bank / cash / credit / wallet balances.
-- 'cash' accounts are treated as investable buying power (feed the rebalancer
-- and the portfolio "cash" total). All accounts roll up into net worth.
create table if not exists accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  name            text not null,
  type            text not null default 'bank'
                  check (type in ('bank', 'cash', 'credit', 'wallet')),
  institution     text,
  currency        text not null default 'SGD',
  current_balance numeric(20, 2) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table accounts enable row level security;

drop policy if exists "Users manage own accounts" on accounts;
create policy "Users manage own accounts"
  on accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One-time migration: fold legacy cash_balances into accounts as 'cash'
-- accounts. Idempotent — skips currencies already present as a cash account.
do $$ begin
  insert into accounts (user_id, name, type, currency, current_balance)
  select cb.user_id, cb.currency || ' Cash', 'cash', cb.currency, cb.balance
  from cash_balances cb
  where not exists (
    select 1 from accounts a
    where a.user_id = cb.user_id and a.type = 'cash' and a.currency = cb.currency
  );
exception when undefined_table then null; when others then null; end $$;

-- Categories: user-defined spending/income buckets. Seeded client-side on
-- first load when empty (see SpendingContext).
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  kind        text not null default 'expense'
              check (kind in ('expense', 'income', 'transfer')),
  color       text,
  icon        text,
  parent_id   uuid references categories(id) on delete set null,
  sort        integer not null default 0,
  created_at  timestamptz default now(),
  unique(user_id, name)
);

alter table categories enable row level security;

drop policy if exists "Users manage own categories" on categories;
create policy "Users manage own categories"
  on categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bank transactions: the spending/income ledger. Distinct from the
-- investment `transactions` table. amount is signed: negative = expense,
-- positive = income. external_id dedupes CSV re-imports and Gmail syncs.
create table if not exists bank_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  account_id   uuid references accounts(id) on delete set null,
  date         date not null default current_date,
  description  text not null default '',
  merchant     text,
  amount       numeric(20, 2) not null default 0,
  currency     text not null default 'SGD',
  category_id  uuid references categories(id) on delete set null,
  source       text not null default 'manual'
               check (source in ('csv', 'email', 'manual')),
  external_id  text,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_bank_txns_user_date
  on bank_transactions(user_id, date desc);
create index if not exists idx_bank_txns_user_category
  on bank_transactions(user_id, category_id);
-- Dedupe key: a user never has the same external_id twice. A full unique
-- constraint (not partial) so it can also serve as an ON CONFLICT target;
-- NULL external_ids (manual entries) remain distinct and are unaffected.
drop index if exists uniq_bank_txns_user_external;
do $$ begin
  alter table bank_transactions
    add constraint bank_txns_user_external_key unique (user_id, external_id);
exception when duplicate_table then null;
         when duplicate_object then null;
         when others then null; end $$;

alter table bank_transactions enable row level security;

drop policy if exists "Users manage own bank transactions" on bank_transactions;
create policy "Users manage own bank transactions"
  on bank_transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User-defined categorization rules (dynamic). Each rule maps a keyword
-- (matched case-insensitively as a substring of description+merchant) to a
-- category. Checked before the built-in keyword list, highest priority first.
create table if not exists category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  match_text  text not null,
  category_id uuid references categories(id) on delete cascade not null,
  priority    integer not null default 0,
  created_at  timestamptz default now(),
  unique(user_id, match_text)
);

create index if not exists idx_category_rules_user on category_rules(user_id);

alter table category_rules enable row level security;

drop policy if exists "Users manage own category rules" on category_rules;
create policy "Users manage own category rules"
  on category_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Google OAuth tokens for Gmail alert sync (Phase B). Stores the long-lived
-- refresh token so the server can mint Gmail access tokens to read DBS/POSB
-- transaction-alert emails. RLS-own: only the user can read/write their row.
create table if not exists google_tokens (
  user_id       uuid primary key references auth.users,
  refresh_token text not null,
  email         text,
  last_synced   timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table google_tokens enable row level security;

drop policy if exists "Users manage own google tokens" on google_tokens;
create policy "Users manage own google tokens"
  on google_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
drop policy if exists "Anyone can read composition cache" on etf_composition_cache;
create policy "Anyone can read composition cache"
  on etf_composition_cache for select
  using (true);

drop policy if exists "Anyone can insert composition cache" on etf_composition_cache;
create policy "Anyone can insert composition cache"
  on etf_composition_cache for insert
  with check (true);

drop policy if exists "Anyone can update composition cache" on etf_composition_cache;
create policy "Anyone can update composition cache"
  on etf_composition_cache for update
  using (true);
