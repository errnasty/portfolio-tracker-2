-- ============================================================
-- Tithe base: which income the pool accrues from (added 2026-07)
-- 'salary' = only Salary-category income (default); 'all' = every income row.
-- Safe to re-run.
-- ============================================================

alter table user_settings add column if not exists tithe_base text not null default 'salary';

do $$ begin
  alter table user_settings
    add constraint user_settings_tithe_base_check check (tithe_base in ('salary', 'all'));
exception when duplicate_object then null;
         when others then null; end $$;
