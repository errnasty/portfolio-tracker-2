-- ============================================================
-- Manually / automatically priced holdings (added 2026-07). Covers funds
-- that aren't on Yahoo Finance (e.g. Singapore unit trusts like LionGlobal).
-- price_source='custom' holdings skip the Yahoo fetch; their price comes
-- from custom_price instead. If price_provider is set, a daily job (and an
-- on-demand "Refresh" button) re-fetches custom_price from that provider —
-- otherwise the user updates it by hand. Safe to re-run.
-- ============================================================

alter table holdings add column if not exists price_source text not null default 'auto';
do $$ begin
  alter table holdings
    add constraint holdings_price_source_check check (price_source in ('auto', 'custom'));
exception when duplicate_object then null;
         when others then null; end $$;

-- Last known NAV/price for a custom holding, and when it was as of.
alter table holdings add column if not exists custom_price       numeric(20, 6);
alter table holdings add column if not exists custom_price_asof  date;
-- Optional auto-refresh source, e.g. provider='lionglobal', ref='SST6'
-- (the fund's code on lionglobalinvestors.com). Null provider = pure manual.
alter table holdings add column if not exists price_provider     text;
alter table holdings add column if not exists price_provider_ref text;
