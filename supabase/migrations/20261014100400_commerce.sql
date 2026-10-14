-- Commerce (QR-*, ORD-*). Name, price and mva are copied onto order lines at purchase, and the
-- commission rate in force is snapshotted onto the order at payment time (COM-02).

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null,
  -- Short order number per vendor per Oslo calendar day (ORD-01), set by trigger.
  service_date date not null default (now() at time zone 'Europe/Oslo')::date,
  order_number integer not null default 0,
  status public.order_status not null default 'pending_payment',
  -- Secret for the customer's tracking link (ORD-03). Server code reads orders by token.
  tracking_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  customer_name text,
  customer_email text,
  pickup_note text,
  locale text not null default 'nb' check (locale in ('nb', 'en')),
  total_ore bigint not null check (total_ore >= 0),
  mva_ore bigint not null default 0 check (mva_ore >= 0 and mva_ore <= total_ore),
  -- Commission snapshot (COM-02), filled in when the order is paid.
  commission_rule_id uuid,
  commission_type public.commission_type,
  commission_rate_bp integer check (commission_rate_bp between 0 and 10000),
  commission_fixed_ore bigint check (commission_fixed_ore >= 0),
  commission_ore bigint check (commission_ore >= 0),
  commission_mva_ore bigint check (commission_mva_ore >= 0),
  platform_fee_ore bigint check (platform_fee_ore >= 0),
  paid_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_vendor_id, service_date, order_number),
  unique (id, organization_id),
  unique (id, vendor_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete restrict,
  foreign key (event_vendor_id, vendor_id) references public.event_vendors (id, vendor_id),
  check (
    status in ('pending_payment', 'cancelled')
    or (commission_ore is not null and commission_mva_ore is not null
        and platform_fee_ore is not null and paid_at is not null)
  ),
  check (platform_fee_ore is null or platform_fee_ore = commission_ore + commission_mva_ore),
  check (platform_fee_ore is null or platform_fee_ore <= total_ore)
);
comment on column public.orders.customer_name is 'PERSONAL DATA';
comment on column public.orders.customer_email is 'PERSONAL DATA';
comment on column public.orders.pickup_note is 'PERSONAL DATA (may contain a name or table)';
create index orders_organization_id_idx on public.orders (organization_id);
create index orders_event_org_idx on public.orders (event_id, organization_id);
create index orders_event_vendor_org_idx on public.orders (event_vendor_id, organization_id);
create index orders_event_vendor_vendor_idx on public.orders (event_vendor_id, vendor_id);
create index orders_vendor_status_idx on public.orders (vendor_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  order_id uuid not null,
  vendor_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  unit_price_ore bigint not null check (unit_price_ore >= 0),
  quantity integer not null check (quantity between 1 and 99),
  mva_rate_bp integer not null default 0 check (mva_rate_bp between 0 and 2500),
  line_total_ore bigint not null,
  mva_ore bigint not null default 0,
  created_at timestamptz not null default now(),
  check (line_total_ore = unit_price_ore * quantity),
  check (mva_ore >= 0 and mva_ore <= line_total_ore),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (order_id, organization_id) references public.orders (id, organization_id)
    on delete restrict,
  foreign key (order_id, vendor_id) references public.orders (id, vendor_id),
  foreign key (product_id, vendor_id) references public.products (id, vendor_id)
    on delete restrict
);
create index order_items_organization_id_idx on public.order_items (organization_id);
create index order_items_event_org_idx on public.order_items (event_id, organization_id);
create index order_items_order_org_idx on public.order_items (order_id, organization_id);
create index order_items_order_vendor_idx on public.order_items (order_id, vendor_id);
create index order_items_product_vendor_idx on public.order_items (product_id, vendor_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  order_id uuid not null,
  vendor_id uuid not null,
  provider public.payment_provider not null,
  provider_payment_id text,
  method public.payment_method,
  status public.payment_status not null default 'pending',
  currency char(3) not null default 'NOK' check (currency = 'NOK'),
  amount_ore bigint not null check (amount_ore > 0),
  platform_fee_ore bigint not null check (platform_fee_ore >= 0),
  psp_fee_ore bigint check (psp_fee_ore >= 0),
  -- One payment attempt per key: makes checkout retries safe (NFR-04).
  idempotency_key text not null unique,
  failure_reason text,
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  unique (id, organization_id),
  check (platform_fee_ore <= amount_ore),
  check ((status = 'succeeded') = (succeeded_at is not null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (order_id, organization_id) references public.orders (id, organization_id)
    on delete restrict,
  foreign key (order_id, vendor_id) references public.orders (id, vendor_id)
);
create index payments_organization_id_idx on public.payments (organization_id);
create index payments_event_org_idx on public.payments (event_id, organization_id);
create index payments_order_org_idx on public.payments (order_id, organization_id);
create index payments_order_vendor_idx on public.payments (order_id, vendor_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  payment_id uuid not null,
  order_id uuid not null,
  vendor_id uuid not null,
  amount_ore bigint not null check (amount_ore > 0),
  -- AFFN's fee reversed pro rata (PRD §5).
  platform_fee_reversal_ore bigint not null default 0 check (platform_fee_reversal_ore >= 0),
  status public.refund_status not null default 'pending',
  provider_refund_id text unique,
  reason text not null check (length(trim(reason)) > 0),
  requested_by uuid references auth.users (id) on delete set null,
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform_fee_reversal_ore <= amount_ore),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (payment_id, organization_id) references public.payments (id, organization_id)
    on delete restrict,
  foreign key (order_id, vendor_id) references public.orders (id, vendor_id)
);
create index refunds_organization_id_idx on public.refunds (organization_id);
create index refunds_event_org_idx on public.refunds (event_id, organization_id);
create index refunds_payment_org_idx on public.refunds (payment_id, organization_id);
create index refunds_order_vendor_idx on public.refunds (order_id, vendor_id);
create index refunds_requested_by_idx on public.refunds (requested_by);

-- Next short order number for the vendor and Oslo day. The advisory lock serialises
-- concurrent checkouts for the same vendor and day.
create function private.assign_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.event_vendor_id::text || ':' || new.service_date::text, 0)
  );
  select coalesce(max(o.order_number), 0) + 1
    into new.order_number
    from public.orders o
   where o.event_vendor_id = new.event_vendor_id
     and o.service_date = new.service_date;
  return new;
end;
$$;

create trigger orders_assign_number before insert on public.orders
  for each row execute function private.assign_order_number();
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();
create trigger refunds_updated_at before update on public.refunds
  for each row execute function private.set_updated_at();
