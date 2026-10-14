-- P03 foundation: private schema, enums and shared trigger functions.
--
-- Conventions (CLAUDE.md):
--   * UUID primary keys, timestamptz (UTC), money as bigint øre.
--   * organization_id on every table, event_id on event-scoped tables.
--   * Helpers and trigger functions live in schema `private`, which is not exposed by the API.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- We use the REST API (supabase-js), not GraphQL. Removing pg_graphql keeps table structure
-- from being discoverable through /graphql/v1 (Supabase advisor lints 0026/0027).
drop extension if exists pg_graphql;

-- Nothing in public is reachable by anon/authenticated unless granted explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Enums ------------------------------------------------------------------------------------

create type public.membership_role as enum ('org_admin', 'event_admin', 'vendor', 'sponsor');
create type public.event_status as enum ('draft', 'published', 'closed', 'archived');
create type public.application_status as enum (
  'draft', 'submitted', 'under_review', 'more_info_requested',
  'approved', 'rejected', 'waitlisted', 'withdrawn'
);
create type public.document_type as enum ('mattilsynet_registration', 'insurance', 'other');
create type public.review_status as enum ('pending', 'accepted', 'rejected');
create type public.psp_account_status as enum ('not_started', 'pending', 'eligible', 'restricted');
create type public.assignment_status as enum ('active', 'released');
create type public.allergen as enum (
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
  'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
);
create type public.dietary_tag as enum (
  'vegetarian', 'vegan', 'halal', 'gluten_free', 'dairy_free', 'spicy'
);
create type public.order_status as enum (
  'pending_payment', 'new', 'accepted', 'preparing', 'ready', 'collected', 'cancelled'
);
create type public.payment_provider as enum ('mock', 'stripe', 'swedbank');
create type public.payment_method as enum ('vipps', 'card', 'apple_pay', 'google_pay');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.refund_status as enum ('pending', 'succeeded', 'failed');
create type public.commission_scope as enum ('organization', 'event', 'category', 'vendor');
create type public.commission_type as enum ('percentage', 'fixed', 'hybrid');
create type public.ledger_account as enum (
  'psp_clearing', 'vendor_payable', 'vendor_receivable',
  'commission_revenue', 'mva_payable', 'psp_fee_expense'
);
create type public.ledger_direction as enum ('debit', 'credit');
create type public.ledger_entry_type as enum (
  'sale', 'commission', 'commission_mva', 'psp_fee', 'refund',
  'refund_commission_reversal', 'payout', 'adjustment', 'dispute'
);
create type public.settlement_status as enum (
  'draft', 'prepared', 'approved', 'releasing', 'completed', 'completed_with_failures', 'cancelled'
);
create type public.payout_status as enum ('pending', 'in_transit', 'paid', 'failed');
create type public.invoice_kind as enum ('commission', 'stall_fee');
create type public.invoice_status as enum ('issued', 'paid', 'credited');
create type public.stall_fee_status as enum ('open', 'invoiced', 'paid', 'cancelled');
create type public.sponsorship_status as enum ('inquiry', 'confirmed', 'invoiced', 'paid', 'cancelled');
create type public.asset_kind as enum ('logo', 'banner', 'video', 'other');
create type public.link_kind as enum ('qr', 'link');
create type public.lead_kind as enum ('contact', 'catering', 'quote');
create type public.lead_status as enum ('new', 'contacted', 'closed');
create type public.audit_action as enum ('insert', 'update', 'delete');
create type public.webhook_outcome as enum ('processed', 'ignored', 'failed');

-- Shared trigger functions -------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only tables: money and evidence rows are never changed or removed. Corrections are
-- new rows. Applies to every role, including service_role.
create function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on %.% is not allowed: the table is append-only', tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001', hint = 'Insert a correcting row instead.';
end;
$$;
