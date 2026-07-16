-- ============================================================
-- Insurance policies (added 2026-07). Tracks coverage (sum assured),
-- premiums (which can auto-create a linked planned_payment so they show in
-- Upcoming and optionally post as transactions), and any cash/surrender
-- value that nets into net worth like an asset. Safe to re-run.
-- ============================================================

create table if not exists insurance_policies (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users not null,
  name               text not null,
  insurer            text,
  policy_type        text not null default 'term'
    check (policy_type in ('term','whole','ilp','health','accident','car','home','travel','other')),
  policy_number      text,
  sum_assured        numeric(20, 2),
  currency           text not null default 'SGD',
  premium_amount     numeric(20, 2),
  premium_frequency  text not null default 'yearly'
    check (premium_frequency in ('monthly','quarterly','yearly','single','none')),
  next_premium_due   date,
  planned_payment_id uuid references planned_payments(id) on delete set null,
  cash_value         numeric(20, 2),          -- surrender/cash value -> net worth
  cash_value_asof    date,
  start_date         date,
  end_date           date,                     -- maturity / expiry
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_insurance_user on insurance_policies(user_id);

alter table insurance_policies enable row level security;

drop policy if exists "Users manage own insurance" on insurance_policies;
create policy "Users manage own insurance"
  on insurance_policies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
