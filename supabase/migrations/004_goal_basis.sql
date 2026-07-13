-- ============================================================
-- Goal basis: what a goal's projection starts from (added 2026-07)
-- 'portfolio' = holdings + investable cash (legacy behavior)
-- 'networth'  = full net worth including all accounts
-- Safe to re-run.
-- ============================================================

alter table goals add column if not exists basis text not null default 'portfolio';

do $$ begin
  alter table goals
    add constraint goals_basis_check check (basis in ('portfolio', 'networth'));
exception when duplicate_object then null;
         when others then null; end $$;
