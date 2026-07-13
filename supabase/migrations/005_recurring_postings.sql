-- ============================================================
-- Recurring transaction posting (added 2026-07). A planned payment with
-- post_as_transaction=true books a real bank transaction each time its due
-- date passes (salary, rent, allowance) and advances to the next due date.
-- flow: 'bill' posts money out, 'income' posts money in.
-- Safe to re-run.
-- ============================================================

alter table planned_payments add column if not exists post_as_transaction boolean not null default false;
alter table planned_payments add column if not exists flow text not null default 'bill';

do $$ begin
  alter table planned_payments
    add constraint planned_payments_flow_check check (flow in ('bill', 'income'));
exception when duplicate_object then null;
         when others then null; end $$;
