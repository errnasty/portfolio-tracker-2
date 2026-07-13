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

