-- P14 Transaction centre and reconciliation (TRX-01 … TRX-03).

create type public.reconciliation_kind as enum (
  'missing_ours', 'missing_theirs', 'amount_differs', 'fee_differs'
);
create type public.reconciliation_status as enum ('open', 'assigned', 'resolved');
create type public.transaction_kind as enum ('payment', 'refund', 'payout');

-- One run of the daily job (or "Run now"): the period compared and what it found.
create table public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  provider public.payment_provider not null,
  period_from timestamptz not null,
  period_to timestamptz not null,
  provider_count integer not null default 0,
  matched_count integer not null default 0,
  mismatch_count integer not null default 0,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_to > period_from)
);
create index reconciliation_runs_organization_id_idx on public.reconciliation_runs (organization_id);
create index reconciliation_runs_triggered_by_idx on public.reconciliation_runs (triggered_by);

-- A mismatch to act on: assigned, commented, resolved with a reason (all audited). Provider
-- transactions we do not know have no event (event_id null).
create table public.reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_id uuid,
  run_id uuid not null references public.reconciliation_runs (id) on delete restrict,
  last_seen_run_id uuid references public.reconciliation_runs (id) on delete restrict,
  kind public.reconciliation_kind not null,
  transaction_kind public.transaction_kind not null,
  provider_id text not null,
  our_amount_ore bigint,
  their_amount_ore bigint,
  our_fee_ore bigint,
  their_fee_ore bigint,
  payment_id uuid,
  refund_id uuid references public.refunds (id) on delete restrict,
  payout_id uuid references public.payouts (id) on delete restrict,
  occurred_at timestamptz,
  status public.reconciliation_status not null default 'open',
  assigned_to uuid references auth.users (id) on delete set null,
  resolution_reason text,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (payment_id, organization_id) references public.payments (id, organization_id)
    on delete restrict,
  check (status <> 'resolved' or (length(trim(coalesce(resolution_reason, ''))) > 0 and resolved_at is not null)),
  check (status <> 'assigned' or assigned_to is not null)
);
-- One open item per provider transaction and kind (later runs update it instead of adding more).
create unique index reconciliation_items_open_idx on public.reconciliation_items (provider_id, kind)
  where status <> 'resolved';
create index reconciliation_items_organization_id_idx on public.reconciliation_items (organization_id);
create index reconciliation_items_event_org_idx on public.reconciliation_items (event_id, organization_id);
create index reconciliation_items_run_id_idx on public.reconciliation_items (run_id);
create index reconciliation_items_last_seen_run_id_idx on public.reconciliation_items (last_seen_run_id);
create index reconciliation_items_payment_org_idx on public.reconciliation_items (payment_id, organization_id);
create index reconciliation_items_refund_id_idx on public.reconciliation_items (refund_id);
create index reconciliation_items_payout_id_idx on public.reconciliation_items (payout_id);
create index reconciliation_items_assigned_to_idx on public.reconciliation_items (assigned_to);
create index reconciliation_items_resolved_by_idx on public.reconciliation_items (resolved_by);
create trigger reconciliation_items_updated_at before update on public.reconciliation_items
  for each row execute function private.set_updated_at();
create trigger reconciliation_items_audit after insert or update on public.reconciliation_items
  for each row execute function private.audit_change('status');

create table public.reconciliation_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  item_id uuid not null references public.reconciliation_items (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index reconciliation_comments_organization_id_idx on public.reconciliation_comments (organization_id);
create index reconciliation_comments_item_id_idx on public.reconciliation_comments (item_id);
create index reconciliation_comments_author_id_idx on public.reconciliation_comments (author_id);

-- TEST MODE only: changes the mock provider's settlement report so injected mismatches can be
-- detected (drop a transaction, change its amount or fee, or add one we do not know). Server code
-- only; never used with a real provider.
create table public.mock_report_overrides (
  provider_id text primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  action text not null check (action in ('drop', 'amount', 'fee', 'extra')),
  transaction_kind public.transaction_kind not null default 'payment',
  amount_ore bigint,
  fee_ore bigint,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index mock_report_overrides_organization_id_idx on public.mock_report_overrides (organization_id);

alter table public.reconciliation_runs enable row level security;
alter table public.reconciliation_items enable row level security;
alter table public.reconciliation_comments enable row level security;
alter table public.mock_report_overrides enable row level security;

grant select on public.reconciliation_runs, public.reconciliation_items,
  public.reconciliation_comments to authenticated;
grant update (status, assigned_to, resolution_reason, resolved_by, resolved_at)
  on public.reconciliation_items to authenticated;
grant insert on public.reconciliation_comments to authenticated;

-- Organization staff (Organization and Event Admins) work the mismatches.
create policy reconciliation_runs_select on public.reconciliation_runs for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_staff(organization_id));
create policy reconciliation_items_select on public.reconciliation_items for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_staff(organization_id));
create policy reconciliation_items_update on public.reconciliation_items for update to authenticated
  using (private.is_org_staff(organization_id))
  with check (private.is_org_staff(organization_id));
create policy reconciliation_comments_select on public.reconciliation_comments for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_staff(organization_id));
create policy reconciliation_comments_insert on public.reconciliation_comments for insert to authenticated
  with check (private.is_org_staff(organization_id) and author_id = (select auth.uid()));

-- Resolving stamps who and when; reopening clears it.
create function private.guard_reconciliation_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_by := coalesce(auth.uid(), new.resolved_by);
    new.resolved_at := now();
    if auth.uid() is not null then
      perform set_config('affn.audit_reason', coalesce(new.resolution_reason, ''), true);
    end if;
  elsif new.status <> 'resolved' then
    new.resolved_by := null;
    new.resolved_at := null;
    new.resolution_reason := null;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reconciliation_item() from public;
create trigger reconciliation_items_guard before update on public.reconciliation_items
  for each row execute function private.guard_reconciliation_item();

-- Stores a run (server code): new mismatches become items, ones seen again are updated, and open
-- ones for the period that are no longer found are resolved by the system.
create function public.record_reconciliation(
  p_organization_id uuid,
  p_provider public.payment_provider,
  p_from timestamptz,
  p_to timestamptz,
  p_provider_count integer,
  p_matched integer,
  p_items jsonb,
  p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_item jsonb;
begin
  insert into public.reconciliation_runs (
    organization_id, provider, period_from, period_to, provider_count, matched_count,
    mismatch_count, triggered_by
  ) values (
    p_organization_id, p_provider, p_from, p_to, p_provider_count, p_matched,
    jsonb_array_length(p_items), p_user
  ) returning id into v_run;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.reconciliation_items (
      organization_id, event_id, run_id, last_seen_run_id, kind, transaction_kind, provider_id,
      our_amount_ore, their_amount_ore, our_fee_ore, their_fee_ore, payment_id, refund_id,
      payout_id, occurred_at
    ) values (
      p_organization_id, nullif(v_item ->> 'event_id', '')::uuid, v_run, v_run,
      (v_item ->> 'kind')::public.reconciliation_kind,
      (v_item ->> 'transaction_kind')::public.transaction_kind, v_item ->> 'provider_id',
      (v_item ->> 'our_amount_ore')::bigint, (v_item ->> 'their_amount_ore')::bigint,
      (v_item ->> 'our_fee_ore')::bigint, (v_item ->> 'their_fee_ore')::bigint,
      nullif(v_item ->> 'payment_id', '')::uuid, nullif(v_item ->> 'refund_id', '')::uuid,
      nullif(v_item ->> 'payout_id', '')::uuid, (v_item ->> 'occurred_at')::timestamptz
    )
    on conflict (provider_id, kind) where status <> 'resolved' do update
       set last_seen_run_id = v_run,
           our_amount_ore = excluded.our_amount_ore,
           their_amount_ore = excluded.their_amount_ore,
           our_fee_ore = excluded.our_fee_ore,
           their_fee_ore = excluded.their_fee_ore;
  end loop;

  update public.reconciliation_items i
     set status = 'resolved',
         resolution_reason = 'No longer differs in a later reconciliation',
         resolved_at = now()
   where i.organization_id = p_organization_id and i.status <> 'resolved'
     and i.occurred_at >= p_from and i.occurred_at < p_to
     and i.last_seen_run_id <> v_run;
  return v_run;
end;
$$;
revoke all on function public.record_reconciliation(uuid, public.payment_provider, timestamptz, timestamptz, integer, integer, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.record_reconciliation(uuid, public.payment_provider, timestamptz, timestamptz, integer, integer, jsonb, uuid)
  to service_role;

-- Unresolved mismatches of the event, and those we cannot place, block settlement (P13).
create or replace function private.unreconciled_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.reconciliation_items i
    join public.events e on e.id = p_event_id
   where i.status <> 'resolved'
     and i.organization_id = e.organization_id
     and (i.event_id = p_event_id or i.event_id is null);
$$;

-- Transaction centre (TRX-01): payments, refunds and payouts in one list. Runs as the caller, so
-- each table's RLS applies.
create view public.transactions with (security_invoker = true) as
  select 'payment'::public.transaction_kind as kind, p.id, p.organization_id, p.event_id,
         p.vendor_id, p.order_id, o.order_code, p.provider, p.provider_payment_id as provider_id,
         p.method, p.status::text as status, p.amount_ore, p.platform_fee_ore as fee_ore,
         p.psp_fee_ore, coalesce(p.succeeded_at, p.created_at) as occurred_at, o.customer_name
    from public.payments p
    join public.orders o on o.id = p.order_id
  union all
  select 'refund', r.id, r.organization_id, r.event_id, r.vendor_id, r.order_id, o.order_code,
         p.provider, r.provider_refund_id, p.method, r.status::text, -r.amount_ore,
         -r.platform_fee_reversal_ore, null, coalesce(r.succeeded_at, r.created_at),
         o.customer_name
    from public.refunds r
    join public.payments p on p.id = r.payment_id
    join public.orders o on o.id = r.order_id
  union all
  select 'payout', po.id, po.organization_id, po.event_id, po.vendor_id, null, null,
         po.provider, po.provider_payout_id, null, po.status::text, -po.amount_ore, 0, null,
         coalesce(po.paid_at, po.created_at), null
    from public.payouts po;
grant select on public.transactions to authenticated;
