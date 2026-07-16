-- ============================================================
-- Liquidity / lock-in tracking (added 2026-07). Some investments lock your
-- money until a date (endowment/savings plans, locked unit trusts & private
-- funds, ILP surrender-penalty periods, CPF/SRS retirement). A `locked_until`
-- date on holdings, assets, and policies lets net worth split into liquid vs
-- locked, and surfaces an "unlocks on" timeline. ILPs also get invested_value
-- (current account value) distinct from cash_value (surrender value).
-- Safe to re-run.
-- ============================================================

alter table holdings           add column if not exists locked_until date;
alter table assets             add column if not exists locked_until date;
alter table insurance_policies add column if not exists locked_until date;
alter table insurance_policies add column if not exists invested_value numeric(20, 2);
