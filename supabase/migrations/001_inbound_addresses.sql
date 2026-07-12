-- Migration: Inbound email forwarding tables
-- Run this in your Supabase SQL Editor (Dashboard → SQL → New Query)
-- to create the tables needed for bank-email forwarding.
--
-- This is a standalone migration extracted from supabase-schema.sql so
-- existing deployments can add the feature without re-running the whole schema.

-- ── inbound_addresses ────────────────────────────────────────────────────
-- Each user gets a unique address (e.g. abc123@inbound.aureus.app) to
-- forward bank notification emails to. The /api/inbound/email webhook
-- receives the raw email, parses it with parseDbsAlert(), and inserts a
-- bank_transactions row.

create table if not exists inbound_addresses (
  user_id       uuid primary key references auth.users,
  address       text not null unique,
  address_local text not null,
  last_synced   timestamptz,
  total_synced  integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table inbound_addresses enable row level security;

drop policy if exists "Users manage own inbound address" on inbound_addresses;
create policy "Users manage own inbound address"
  on inbound_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Verify ──────────────────────────────────────────────────────────────
-- After running, you should see the table in Table Editor.
-- The ForwardAddressCard component will auto-provision an address on first
-- visit to the Settings page.

-- ── Optional: atomic balance increment RPC ──────────────────────────────
-- This function atomically increments an account's balance, avoiding the
-- read-modify-write race in the webhook. If you don't create it, the
-- webhook falls back to a read-modify-write (fine for low traffic).
create or replace function increment_account_balance(
  p_account_id uuid,
  p_delta      numeric
) returns void as $$
begin
  update accounts
    set current_balance = current_balance + p_delta,
        updated_at = now()
    where id = p_account_id;
end;
$$ language plpgsql security definer;

