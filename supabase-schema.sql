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

-- What the goal projection starts from: 'portfolio' (holdings + investable
-- cash) or 'networth' (all accounts + holdings).
alter table goals add column if not exists basis text not null default 'portfolio';
do $$ begin
  alter table goals
    add constraint goals_basis_check check (basis in ('portfolio', 'networth'));
exception when duplicate_object then null;
         when others then null; end $$;

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

-- Payee grouping + review queue (added 2026-07). payee_key is a stable
-- per-counterparty key (mobile:9989 / acct:0152 / name:...); needs_review flags
-- rows the email parser was unsure about or that look like duplicates.
alter table bank_transactions add column if not exists payee_key   text;
alter table bank_transactions add column if not exists needs_review boolean not null default false;
create index if not exists idx_bank_txns_user_review
  on bank_transactions(user_id, needs_review) where needs_review;
create index if not exists idx_bank_txns_user_payeekey
  on bank_transactions(user_id, payee_key);

-- Friendly names for masked payees, keyed by payee_key. Resolved at render time
-- so a rename propagates to all past + future rows.
create table if not exists payee_aliases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  payee_key  text not null,
  alias      text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, payee_key)
);
create index if not exists idx_payee_aliases_user on payee_aliases(user_id);
alter table payee_aliases enable row level security;
drop policy if exists "Users manage own payee aliases" on payee_aliases;
create policy "Users manage own payee aliases" on payee_aliases for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

-- Monthly budgets per category (amounts in the user's base display currency).
create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  category_id uuid references categories(id) on delete cascade not null,
  amount      numeric(20, 2) not null default 0,
  period      text not null default 'monthly' check (period in ('monthly')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, category_id)
);

alter table budgets enable row level security;

drop policy if exists "Users manage own budgets" on budgets;
create policy "Users manage own budgets"
  on budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Subscription cancel-tracking. Subscriptions themselves are derived from
-- bank_transactions at runtime; this table only persists the per-merchant
-- status (active / could_cancel / cancelled) so the savings tracker sticks.
create table if not exists subscription_status (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  merchant_key   text not null,
  status         text not null default 'active'
                 check (status in ('active', 'could_cancel', 'cancelled')),
  label          text,
  monthly_amount numeric(20, 2),
  updated_at     timestamptz default now(),
  unique(user_id, merchant_key)
);

alter table subscription_status enable row level security;

drop policy if exists "Users manage own subscription status" on subscription_status;
create policy "Users manage own subscription status"
  on subscription_status for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Net-worth snapshots: one row per day so Home can plot a trend line. Written
-- client-side once a day (upsert on user_id+date). All in the user's base
-- currency at snapshot time.
create table if not exists networth_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  date       date not null default current_date,
  net_worth  numeric(20, 2) not null,
  currency   text not null default 'USD',
  created_at timestamptz default now(),
  unique(user_id, date)
);

create index if not exists idx_networth_user_date on networth_snapshots(user_id, date);

alter table networth_snapshots enable row level security;

drop policy if exists "Users manage own networth snapshots" on networth_snapshots;
create policy "Users manage own networth snapshots"
  on networth_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DEPRECATED: google_tokens is replaced by inbound_addresses (email forwarding).
-- Kept for migration reference; new deployments should use inbound_addresses instead.
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

-- Inbound forwarding addresses for bank email sync. Each user gets a unique
-- address (e.g. abc123@inbound.aureus.app) to forward/CC bank notification
-- emails to. The /api/inbound/email webhook receives the raw email, parses it
-- with parseDbsAlert(), and inserts a bank_transactions row.
-- Replaces the old Google OAuth + Gmail API approach (google_tokens table).
create table if not exists inbound_addresses (
  user_id       uuid primary key references auth.users,
  address       text not null unique,          -- e.g. "abc123@inbound.aureus.app"
  address_local text not null,                  -- e.g. "abc123" (before the @)
  last_synced   timestamptz,                    -- last time /api/inbound/email ran
  total_synced  integer not null default 0,     -- lifetime count of imported txns
  created_at    timestamptz not null default now()
);

alter table inbound_addresses enable row level security;

drop policy if exists "Users manage own inbound address" on inbound_addresses;
create policy "Users manage own inbound address"
  on inbound_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Atomic balance increment RPC (used by /api/inbound/email webhook).
-- Avoids the read-modify-write race when two webhooks fire concurrently.
create or replace function increment_account_balance(
  p_account_id uuid,
  p_delta      numeric
) returns void as $$
begin
  update accounts
    set current_balance = current_balance + p_delta,
        updated_at = now()
    where id = p_account_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Money features: planned payments, IOUs, tithing (added 2026-07)
-- ============================================================

-- Forwarding-address verification (e.g. Gmail's "Forward to" requires the
-- destination address to confirm). The inbound webhook captures the
-- verification email sent to the user's address and stores the code + link
-- here so the user can complete verification from the Settings page.
alter table inbound_addresses add column if not exists verify_code        text;
alter table inbound_addresses add column if not exists verify_link        text;
alter table inbound_addresses add column if not exists verify_from        text;
alter table inbound_addresses add column if not exists verify_received_at timestamptz;

-- Planned payments: manual upcoming payment deadlines (bills, fees, rent).
-- Recurring rows advance due_date when marked paid; one-off rows are deleted
-- or kept as paid history via paid_at.
create table if not exists planned_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  amount      numeric(20, 2) not null default 0,
  currency    text not null default 'SGD',
  due_date    date not null,
  repeat      text not null default 'none'
              check (repeat in ('none', 'weekly', 'monthly', 'quarterly', 'yearly')),
  category_id uuid references categories(id) on delete set null,
  account_id  uuid references accounts(id) on delete set null,
  autopay     boolean not null default false,
  notes       text,
  paid_at     timestamptz,          -- set when a one-off payment is settled
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_planned_payments_user_due
  on planned_payments(user_id, due_date);

alter table planned_payments enable row level security;

drop policy if exists "Users manage own planned payments" on planned_payments;
create policy "Users manage own planned payments"
  on planned_payments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- IOUs: money people owe you ('owed_to_me') and money you owe ('i_owe').
-- Net position per person = owed_to_me - i_owe over unsettled rows.
-- tag groups entries by friend group / occasion (e.g. "JB trip", "cell group").
create table if not exists ious (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  person      text not null,
  direction   text not null check (direction in ('owed_to_me', 'i_owe')),
  amount      numeric(20, 2) not null default 0,
  currency    text not null default 'SGD',
  tag         text,                 -- friend group / occasion label
  date        date not null default current_date,
  notes       text,
  settled     boolean not null default false,
  settled_at  timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_ious_user_person on ious(user_id, person);
create index if not exists idx_ious_user_settled on ious(user_id, settled);

alter table ious enable row level security;

drop policy if exists "Users manage own ious" on ious;
create policy "Users manage own ious"
  on ious for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tithing: the pool accrues tithe_rate% of income from tithe_start onward.
-- Giving-category expenses automatically count as tithed; manual clearances
-- (below) cover tithes given outside tracked accounts (e.g. cash).
alter table user_settings add column if not exists tithe_enabled boolean not null default false;
alter table user_settings add column if not exists tithe_rate    numeric(6, 3) not null default 10;
alter table user_settings add column if not exists tithe_start   date;
-- Which income accrues: 'salary' (Salary category only, default) or 'all'.
alter table user_settings add column if not exists tithe_base    text not null default 'salary';
do $$ begin
  alter table user_settings
    add constraint user_settings_tithe_base_check check (tithe_base in ('salary', 'all'));
exception when duplicate_object then null;
         when others then null; end $$;

create table if not exists tithe_clearances (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  date       date not null default current_date,
  amount     numeric(20, 2) not null,
  notes      text,
  created_at timestamptz default now()
);

create index if not exists idx_tithe_clearances_user on tithe_clearances(user_id, date);

alter table tithe_clearances enable row level security;

drop policy if exists "Users manage own tithe clearances" on tithe_clearances;
create policy "Users manage own tithe clearances"
  on tithe_clearances for all
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
