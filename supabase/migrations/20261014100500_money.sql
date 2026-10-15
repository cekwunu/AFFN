-- Money (COM-*, SET-*, TRX-*) and fees (STL-04). Amounts are bigint øre.

-- Commission rules (COM-01, COM-03). Rates are never edited: a change is a new rule with a later
-- effective_from, created by an Organization Admin with a reason, and audit-logged.
-- Precedence when resolving: vendor → category → event → organization.
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  scope public.commission_scope not null,
  event_id uuid,
  category_id uuid,
  vendor_id uuid references public.vendors (id) on delete restrict,
  type public.commission_type not null,
  rate_bp integer check (rate_bp between 0 and 10000),
  fixed_ore bigint check (fixed_ore >= 0),
  effective_from timestamptz not null default now(),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (category_id, organization_id)
    references public.product_categories (id, organization_id) on delete restrict,
  check (
    case scope
      when 'organization' then event_id is null and category_id is null and vendor_id is null
      when 'event' then event_id is not null and category_id is null and vendor_id is null
      when 'category' then category_id is not null and vendor_id is null
      when 'vendor' then vendor_id is not null and category_id is null
    end
  ),
  check (
    case type
      when 'percentage' then rate_bp is not null and fixed_ore is null
      when 'fixed' then fixed_ore is not null and rate_bp is null
      when 'hybrid' then rate_bp is not null and fixed_ore is not null
    end
  )
);
create index commission_rules_organization_id_idx on public.commission_rules (organization_id);
create index commission_rules_event_org_idx on public.commission_rules (event_id, organization_id);
create index commission_rules_category_org_idx on public.commission_rules (category_id, organization_id);
create index commission_rules_vendor_id_idx on public.commission_rules (vendor_id);
create index commission_rules_created_by_idx on public.commission_rules (created_by);
create index commission_rules_lookup_idx
  on public.commission_rules (organization_id, scope, effective_from desc);

alter table public.orders
  add constraint orders_commission_rule_id_fkey foreign key (commission_rule_id)
  references public.commission_rules (id) on delete restrict;
create index orders_commission_rule_id_idx on public.orders (commission_rule_id);

-- Settlements (SET-02): prepared by an Event Admin, approved by a different Organization Admin.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  status public.settlement_status not null default 'draft',
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  prepared_by uuid references auth.users (id) on delete restrict,
  prepared_at timestamptz,
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  -- Four-eyes rule: the approver is never the preparer.
  check (approved_by is null or prepared_by is null or approved_by <> prepared_by),
  check (
    status in ('draft', 'prepared', 'cancelled')
    or (prepared_by is not null and approved_by is not null and approved_at is not null)
  )
);
create index settlements_organization_id_idx on public.settlements (organization_id);
create index settlements_event_org_idx on public.settlements (event_id, organization_id);
create index settlements_created_by_idx on public.settlements (created_by);
create index settlements_prepared_by_idx on public.settlements (prepared_by);
create index settlements_approved_by_idx on public.settlements (approved_by);

-- One line per vendor in a settlement batch: its statement totals.
create table public.settlement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  settlement_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null,
  gross_sales_ore bigint not null check (gross_sales_ore >= 0),
  refunds_ore bigint not null default 0 check (refunds_ore >= 0),
  commission_ore bigint not null default 0 check (commission_ore >= 0),
  commission_mva_ore bigint not null default 0 check (commission_mva_ore >= 0),
  adjustments_ore bigint not null default 0,
  net_payout_ore bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settlement_id, vendor_id),
  unique (id, organization_id),
  check (net_payout_ore = gross_sales_ore - refunds_ore - commission_ore
                          - commission_mva_ore + adjustments_ore),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (settlement_id, organization_id)
    references public.settlements (id, organization_id) on delete cascade,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete restrict,
  foreign key (event_vendor_id, vendor_id) references public.event_vendors (id, vendor_id)
);
create index settlement_lines_organization_id_idx on public.settlement_lines (organization_id);
create index settlement_lines_event_org_idx on public.settlement_lines (event_id, organization_id);
create index settlement_lines_settlement_org_idx on public.settlement_lines (settlement_id, organization_id);
create index settlement_lines_event_vendor_org_idx on public.settlement_lines (event_vendor_id, organization_id);
create index settlement_lines_event_vendor_vendor_idx on public.settlement_lines (event_vendor_id, vendor_id);

-- Manual credit/debit with reason and approval by someone else (SET-05).
create table public.settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  settlement_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  amount_ore bigint not null check (amount_ore <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  approved_by uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (approved_by is null or approved_by <> created_by),
  check ((approved_by is null) = (approved_at is null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (settlement_id, organization_id)
    references public.settlements (id, organization_id) on delete cascade
);
create index settlement_adjustments_organization_id_idx on public.settlement_adjustments (organization_id);
create index settlement_adjustments_event_org_idx on public.settlement_adjustments (event_id, organization_id);
create index settlement_adjustments_settlement_org_idx on public.settlement_adjustments (settlement_id, organization_id);
create index settlement_adjustments_vendor_id_idx on public.settlement_adjustments (vendor_id);
create index settlement_adjustments_created_by_idx on public.settlement_adjustments (created_by);
create index settlement_adjustments_approved_by_idx on public.settlement_adjustments (approved_by);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  settlement_id uuid not null,
  settlement_line_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  provider public.payment_provider not null,
  provider_payout_id text unique,
  amount_ore bigint not null check (amount_ore > 0),
  status public.payout_status not null default 'pending',
  attempt integer not null default 1 check (attempt >= 1),
  failure_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (settlement_id, organization_id)
    references public.settlements (id, organization_id) on delete restrict,
  foreign key (settlement_line_id, organization_id)
    references public.settlement_lines (id, organization_id) on delete restrict
);
create index payouts_organization_id_idx on public.payouts (organization_id);
create index payouts_event_org_idx on public.payouts (event_id, organization_id);
create index payouts_settlement_org_idx on public.payouts (settlement_id, organization_id);
create index payouts_settlement_line_org_idx on public.payouts (settlement_line_id, organization_id);
create index payouts_vendor_id_idx on public.payouts (vendor_id);

-- Double-entry ledger, the source of truth for reporting. Append-only (see append_only
-- migration); every transaction_id must balance (debits = credits).
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  transaction_id uuid not null,
  entry_type public.ledger_entry_type not null,
  account public.ledger_account not null,
  direction public.ledger_direction not null,
  amount_ore bigint not null check (amount_ore > 0),
  vendor_id uuid references public.vendors (id) on delete restrict,
  order_id uuid,
  payment_id uuid,
  refund_id uuid references public.refunds (id) on delete restrict,
  settlement_id uuid,
  payout_id uuid references public.payouts (id) on delete restrict,
  description text,
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (order_id, organization_id) references public.orders (id, organization_id)
    on delete restrict,
  foreign key (payment_id, organization_id) references public.payments (id, organization_id)
    on delete restrict,
  foreign key (settlement_id, organization_id)
    references public.settlements (id, organization_id) on delete restrict
);
create index ledger_entries_organization_id_idx on public.ledger_entries (organization_id);
create index ledger_entries_event_org_idx on public.ledger_entries (event_id, organization_id);
create index ledger_entries_transaction_id_idx on public.ledger_entries (transaction_id);
create index ledger_entries_vendor_id_idx on public.ledger_entries (vendor_id);
create index ledger_entries_order_org_idx on public.ledger_entries (order_id, organization_id);
create index ledger_entries_payment_org_idx on public.ledger_entries (payment_id, organization_id);
create index ledger_entries_refund_id_idx on public.ledger_entries (refund_id);
create index ledger_entries_settlement_org_idx on public.ledger_entries (settlement_id, organization_id);
create index ledger_entries_payout_id_idx on public.ledger_entries (payout_id);
create index ledger_entries_created_by_idx on public.ledger_entries (created_by);

create function private.check_ledger_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  balance bigint;
begin
  select coalesce(sum(case when e.direction = 'debit' then e.amount_ore else -e.amount_ore end), 0)
    into balance
    from public.ledger_entries e
   where e.transaction_id = new.transaction_id;
  if balance <> 0 then
    raise exception 'Ledger transaction % does not balance (debits - credits = % øre)',
      new.transaction_id, balance
      using errcode = '23514';
  end if;
  return null;
end;
$$;

-- Checked at commit, so a transaction can insert its debit and credit rows in any order.
create constraint trigger ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.check_ledger_balance();

-- Stall fees: AFFN's own revenue, paid into AFFN's own account, kept apart from vendor money.
create table public.stall_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null,
  stall_id uuid,
  amount_ore bigint not null check (amount_ore >= 0),
  mva_ore bigint not null default 0 check (mva_ore >= 0),
  total_ore bigint not null,
  status public.stall_fee_status not null default 'open',
  payment_link_url text,
  due_at timestamptz,
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (total_ore = amount_ore + mva_ore),
  check ((status = 'paid') = (paid_at is not null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete restrict,
  foreign key (event_vendor_id, vendor_id) references public.event_vendors (id, vendor_id),
  foreign key (stall_id, organization_id) references public.stalls (id, organization_id)
    on delete restrict
);
comment on column public.stall_fees.mva_ore is 'Mva treatment of stall fees is an open item (PRD §12).';
create index stall_fees_organization_id_idx on public.stall_fees (organization_id);
create index stall_fees_event_org_idx on public.stall_fees (event_id, organization_id);
create index stall_fees_event_vendor_org_idx on public.stall_fees (event_vendor_id, organization_id);
create index stall_fees_event_vendor_vendor_idx on public.stall_fees (event_vendor_id, vendor_id);
create index stall_fees_stall_org_idx on public.stall_fees (stall_id, organization_id);
create index stall_fees_created_by_idx on public.stall_fees (created_by);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  stall_fee_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  provider public.payment_provider not null,
  provider_payment_id text unique,
  amount_ore bigint not null check (amount_ore > 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (stall_fee_id, organization_id) references public.stall_fees (id, organization_id)
    on delete restrict
);
create index fee_payments_organization_id_idx on public.fee_payments (organization_id);
create index fee_payments_event_org_idx on public.fee_payments (event_id, organization_id);
create index fee_payments_stall_fee_org_idx on public.fee_payments (stall_fee_id, organization_id);
create index fee_payments_vendor_id_idx on public.fee_payments (vendor_id);

-- Invoices issued by AFFN: commission (per vendor per settlement) and stall fees.
-- Numbers are sequential per organization without gaps (bokføringsforskriften).
create table public.invoice_counters (
  organization_id uuid primary key references public.organizations (id) on delete restrict,
  last_number bigint not null default 0 check (last_number >= 0)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  kind public.invoice_kind not null,
  invoice_number bigint not null default 0,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  settlement_id uuid,
  stall_fee_id uuid,
  subtotal_ore bigint not null check (subtotal_ore >= 0),
  mva_ore bigint not null default 0 check (mva_ore >= 0),
  total_ore bigint not null,
  status public.invoice_status not null default 'issued',
  settled_by_deduction boolean not null default false,
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  pdf_path text,
  created_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  check (total_ore = subtotal_ore + mva_ore),
  check (
    (kind = 'commission' and settlement_id is not null and stall_fee_id is null)
    or (kind = 'stall_fee' and stall_fee_id is not null and settlement_id is null)
  ),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (settlement_id, organization_id)
    references public.settlements (id, organization_id) on delete restrict,
  foreign key (stall_fee_id, organization_id) references public.stall_fees (id, organization_id)
    on delete restrict
);
create index invoices_event_org_idx on public.invoices (event_id, organization_id);
create index invoices_vendor_id_idx on public.invoices (vendor_id);
create index invoices_settlement_org_idx on public.invoices (settlement_id, organization_id);
create index invoices_stall_fee_org_idx on public.invoices (stall_fee_id, organization_id);

create function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.invoice_counters as c (organization_id, last_number)
  values (new.organization_id, 1)
  on conflict (organization_id) do update set last_number = c.last_number + 1
  returning c.last_number into new.invoice_number;
  return new;
end;
$$;
revoke all on function private.assign_invoice_number() from public;

create trigger invoices_assign_number before insert on public.invoices
  for each row execute function private.assign_invoice_number();

create trigger settlements_updated_at before update on public.settlements
  for each row execute function private.set_updated_at();
create trigger settlement_lines_updated_at before update on public.settlement_lines
  for each row execute function private.set_updated_at();
create trigger payouts_updated_at before update on public.payouts
  for each row execute function private.set_updated_at();
create trigger stall_fees_updated_at before update on public.stall_fees
  for each row execute function private.set_updated_at();
