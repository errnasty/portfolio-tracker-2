-- ============================================================
-- Individual bonds (added 2026-07). Adds a 'bond' kind to the assets ledger
-- (corporate / SGS / retail bonds held directly, alongside the existing
-- T-bill and SSB kinds) plus the bond-specific fields needed to track them:
-- face/par value and coupon frequency. Coupon rate reuses interest_rate_pct
-- and maturity reuses maturity_date (which already feeds the Payments
-- "Upcoming" timeline). Safe to re-run.
-- ============================================================

do $$ begin
  alter table assets drop constraint if exists assets_kind_check;
exception when others then null; end $$;
do $$ begin
  alter table assets add constraint assets_kind_check check (kind in (
    'cpf_oa', 'cpf_sa', 'cpf_ma',
    'fixed_deposit', 'tbill', 'ssb', 'bond',
    'property', 'vehicle', 'other',
    'loan', 'mortgage'
  ));
exception when duplicate_object then null;
         when others then null; end $$;

-- Par/face value (redemption amount at maturity) and how often the coupon
-- pays. balance holds the current market/holding value; interest_rate_pct is
-- the coupon rate p.a.
alter table assets add column if not exists face_value       numeric(20, 2);
alter table assets add column if not exists coupon_frequency text
  check (coupon_frequency is null or coupon_frequency in ('annual','semi_annual','quarterly','monthly','zero'));
