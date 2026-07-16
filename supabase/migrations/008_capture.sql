-- ============================================================
-- Effortless capture (added 2026-07). Two changes:
--  1. A provider-assigned inbound address (e.g. a CloudMailin/Postmark
--     free-tier receiving address like "abc@cloudmailin.net") the user can
--     save until they own a domain. The webhook resolves a forwarded email
--     to a user by matching this OR the deterministic address_local.
--  2. Two new bank_transaction sources: 'paste' (pasted bank SMS/email text)
--     and 'receipt' (photo/screenshot parsed by AI).
-- Safe to re-run.
-- ============================================================

alter table inbound_addresses add column if not exists provider_address text;

-- Lowercase-unique so two users can't claim the same relay address (the
-- webhook matches case-insensitively). Partial: only non-null values.
create unique index if not exists inbound_provider_address_uidx
  on inbound_addresses (lower(provider_address))
  where provider_address is not null;

-- Widen the source check to include the new capture methods.
do $$ begin
  alter table bank_transactions drop constraint if exists bank_transactions_source_check;
exception when others then null; end $$;
do $$ begin
  alter table bank_transactions
    add constraint bank_transactions_source_check
    check (source in ('csv', 'email', 'manual', 'paste', 'receipt'));
exception when duplicate_object then null;
         when others then null; end $$;
