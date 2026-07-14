-- ============================================================
-- Assets & liabilities ledger + net-worth composition (added 2026-07)
-- Everything that isn't a bank account or a brokerage holding: CPF, fixed
-- deposits, T-bills/SSBs, property, vehicles — and loans/mortgages (the
-- liability kinds). Net worth = accounts + holdings + assets − liabilities.
-- Safe to re-run.
-- ============================================================

create table if not exists assets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users not null,
  name              text not null,
  kind              text not null default 'other'
                    check (kind in (
                      'cpf_oa', 'cpf_sa', 'cpf_ma',
                      'fixed_deposit', 'tbill', 'ssb',
                      'property', 'vehicle', 'other',
                      'loan', 'mortgage'
                    )),
  balance           numeric(20, 2) not null default 0,  -- always positive; loan/mortgage = amount owed
  currency          text not null default 'SGD',
  interest_rate_pct numeric(8, 4),                      -- p.a.; loans: cost, deposits: yield
  maturity_date     date,                               -- FDs / T-bills / SSBs
  monthly_payment   numeric(20, 2),                     -- loan installment or recurring contribution
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_assets_user on assets(user_id);

alter table assets enable row level security;

drop policy if exists "Users manage own assets" on assets;
create policy "Users manage own assets"
  on assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Net-worth snapshot composition, so the Net worth page can chart the mix
-- over time (columns are nullable; older rows simply lack a breakdown).
alter table networth_snapshots add column if not exists holdings_value    numeric(20, 2);
alter table networth_snapshots add column if not exists accounts_value    numeric(20, 2);
alter table networth_snapshots add column if not exists assets_value      numeric(20, 2);
alter table networth_snapshots add column if not exists liabilities_value numeric(20, 2);
