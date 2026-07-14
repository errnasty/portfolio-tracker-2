-- ============================================================
-- CPF auto-contribution (added 2026-07). When enabled, each Salary-category
-- income row generates a CPF contribution: 20% employee + 17% employer of the
-- gross Ordinary Wage (recovered from the recorded take-home), allocated to
-- the OA/SA/MA CPF assets by age band. Each contribution is tied to its source
-- transaction so it's applied exactly once.
-- Safe to re-run.
-- ============================================================

alter table user_settings add column if not exists cpf_enabled     boolean not null default false;
alter table user_settings add column if not exists cpf_birth_year  integer;
alter table user_settings add column if not exists cpf_salary_basis text not null default 'take_home';
-- Auto-contributions apply to Salary income dated on/after this (set to the
-- day CPF is enabled) so past salary isn't retroactively double-counted
-- against a manually-entered opening balance.
alter table user_settings add column if not exists cpf_start       date;
do $$ begin
  alter table user_settings
    add constraint user_settings_cpf_basis_check check (cpf_salary_basis in ('take_home', 'gross'));
exception when duplicate_object then null;
         when others then null; end $$;

create table if not exists cpf_contributions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  source_txn_id uuid,                     -- bank_transactions.id this came from (null = manual)
  date          date not null default current_date,
  gross         numeric(20, 2) not null default 0,
  employee      numeric(20, 2) not null default 0,
  employer      numeric(20, 2) not null default 0,
  oa            numeric(20, 2) not null default 0,
  sa            numeric(20, 2) not null default 0,
  ma            numeric(20, 2) not null default 0,
  notes         text,
  created_at    timestamptz default now(),
  unique(user_id, source_txn_id)
);

create index if not exists idx_cpf_contributions_user on cpf_contributions(user_id, date);

alter table cpf_contributions enable row level security;

drop policy if exists "Users manage own cpf contributions" on cpf_contributions;
create policy "Users manage own cpf contributions"
  on cpf_contributions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
