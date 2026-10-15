-- P13 Settlement engine (SET-01 … SET-05). Batches per event turn ledger balances into PSP payouts:
-- prepared by event staff, approved by a different Organization Admin (four eyes, enforced by
-- private.settlement_workflow and the check on settlements), released by server code.

alter type public.ledger_account add value if not exists 'adjustments';

create type public.dispute_status as enum ('open', 'won', 'lost');

-- Batch cut-off: ledger entries up to this time are settled; later ones wait for the next batch.
alter table public.settlements add column cutoff_at timestamptz not null default now();

-- Each line covers the vendor's ledger entries after `period_start` (the previous batch's cut-off)
-- up to the batch cut-off. `refunds_ore` is the vendor's share of refunds and lost disputes (the
-- refunded amount minus the commission and mva given back), so the line still reads
-- gross − refunds − commission − mva + adjustments = net payout.
alter table public.settlement_lines
  add column period_start timestamptz,
  add column cutoff_at timestamptz;

-- Lines are snapshots made by public.prepare_settlement_lines, never typed in.
revoke insert, update, delete on public.settlement_lines from authenticated;

-- Disputes (chargebacks) reported by the payment provider. An open dispute blocks settlement; a
-- lost one takes the amount back from the vendor (deducted in the next settlement, PRD §5).
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  payment_id uuid not null,
  order_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  provider public.payment_provider not null,
  provider_dispute_id text not null,
  amount_ore bigint not null check (amount_ore > 0),
  reason text,
  status public.dispute_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_dispute_id),
  check ((status = 'open') = (closed_at is null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (payment_id, organization_id) references public.payments (id, organization_id)
    on delete restrict,
  foreign key (order_id, vendor_id) references public.orders (id, vendor_id)
);
create index disputes_organization_id_idx on public.disputes (organization_id);
create index disputes_event_org_idx on public.disputes (event_id, organization_id);
create index disputes_payment_org_idx on public.disputes (payment_id, organization_id);
create index disputes_order_vendor_idx on public.disputes (order_id, vendor_id);
create index disputes_vendor_id_idx on public.disputes (vendor_id);
create trigger disputes_updated_at before update on public.disputes
  for each row execute function private.set_updated_at();
create trigger disputes_audit after insert or update on public.disputes
  for each row execute function private.audit_change('status');

alter table public.disputes enable row level security;
grant select on public.disputes to authenticated;
create policy disputes_select on public.disputes for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

-- Provider dispute events (service role, idempotent). A lost dispute is posted once:
-- Dr vendor payable / Cr PSP clearing.
create function public.record_dispute(
  p_provider public.payment_provider,
  p_provider_dispute_id text,
  p_provider_payment_id text,
  p_amount_ore bigint,
  p_reason text,
  p_status public.dispute_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_dispute public.disputes;
begin
  select * into v_payment from public.payments
   where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if not found then
    raise exception 'Unknown payment %', p_provider_payment_id using errcode = 'no_data_found';
  end if;
  insert into public.disputes (
    organization_id, event_id, payment_id, order_id, vendor_id, provider, provider_dispute_id,
    amount_ore, reason, status, closed_at
  ) values (
    v_payment.organization_id, v_payment.event_id, v_payment.id, v_payment.order_id,
    v_payment.vendor_id, p_provider, p_provider_dispute_id, p_amount_ore, p_reason, p_status,
    case when p_status = 'open' then null else now() end
  )
  on conflict (provider, provider_dispute_id) do update
     set status = case when public.disputes.status = 'open' then excluded.status
                       else public.disputes.status end,
         closed_at = case when public.disputes.status = 'open' then excluded.closed_at
                          else public.disputes.closed_at end
  returning * into v_dispute;

  if v_dispute.status = 'lost' and not exists (
    select 1 from public.ledger_entries
     where entry_type = 'dispute' and payment_id = v_payment.id
       and description = 'Dispute ' || v_dispute.provider_dispute_id
  ) then
    insert into public.ledger_entries (
      organization_id, event_id, transaction_id, entry_type, account, direction, amount_ore,
      vendor_id, order_id, payment_id, description
    )
    select v_dispute.organization_id, v_dispute.event_id, tx, 'dispute', a.account, a.direction,
           v_dispute.amount_ore, v_dispute.vendor_id, v_dispute.order_id, v_payment.id,
           'Dispute ' || v_dispute.provider_dispute_id
      from (select gen_random_uuid() as tx) t,
           (values ('vendor_payable'::public.ledger_account, 'debit'::public.ledger_direction),
                   ('psp_clearing', 'credit')) as a (account, direction);
  end if;
  return v_dispute.id;
end;
$$;

-- The settlement maths: the vendor's ledger movements in a period (PRD §6), from vendor_payable
-- and the AFFN accounts. Gross from sales; refunds = the vendor's share of refunds and lost
-- disputes; commission and mva as charged on the sales.
create function private.vendor_period(
  p_event_id uuid,
  p_vendor_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (gross bigint, refunds bigint, commission bigint, mva bigint, net bigint, entries bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(amount_ore) filter (where entry_type = 'sale' and account = 'psp_clearing'), 0)::bigint,
    coalesce(sum(amount_ore) filter (where entry_type in ('refund', 'dispute')
                                     and account = 'vendor_payable'), 0)::bigint,
    coalesce(sum(amount_ore) filter (where entry_type = 'commission'), 0)::bigint,
    coalesce(sum(amount_ore) filter (where entry_type = 'commission_mva'), 0)::bigint,
    coalesce(sum(case when direction = 'credit' then amount_ore else -amount_ore end)
             filter (where account = 'vendor_payable'
                     and entry_type not in ('payout', 'adjustment')), 0)::bigint,
    count(*) filter (where account = 'vendor_payable' and entry_type not in ('payout', 'adjustment'))
    from public.ledger_entries
   where event_id = p_event_id and vendor_id = p_vendor_id
     and created_at > coalesce(p_from, '-infinity') and created_at <= p_to;
$$;
revoke all on function private.vendor_period(uuid, uuid, timestamptz, timestamptz) from public;

-- Where the vendor's next settlement period starts: the cut-off of its latest batch that is not
-- a draft or cancelled.
create function private.vendor_settled_until(p_event_id uuid, p_vendor_id uuid, p_exclude uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(l.cutoff_at)
    from public.settlement_lines l
    join public.settlements s on s.id = l.settlement_id
   where l.event_id = p_event_id and l.vendor_id = p_vendor_id and s.id <> p_exclude
     and s.status not in ('draft', 'cancelled');
$$;
revoke all on function private.vendor_settled_until(uuid, uuid, uuid) from public;

-- Snapshot (or refresh) a draft batch's lines (SET-02). First call: the given vendors, or every
-- vendor with unsettled ledger movements; later calls refresh the vendors already in the batch
-- (after an adjustment is approved). Vendors already in another open batch are skipped.
create function private.prepare_settlement_lines(p_settlement_id uuid, p_vendor_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.settlements;
  v_vendor record;
  v_from timestamptz;
  v_period record;
  v_adjustments bigint;
  v_count integer := 0;
begin
  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if auth.uid() is not null
     and not private.is_event_staff(v_settlement.organization_id, v_settlement.event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_settlement.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'check_violation';
  end if;

  for v_vendor in
    select ev.id as event_vendor_id, ev.vendor_id
      from public.event_vendors ev
     where ev.event_id = v_settlement.event_id
       and (
         exists (select 1 from public.settlement_lines l
                  where l.settlement_id = v_settlement.id and l.vendor_id = ev.vendor_id)
         or (
           not exists (select 1 from public.settlement_lines l
                        where l.settlement_id = v_settlement.id)
           and (p_vendor_ids is null or ev.vendor_id = any (p_vendor_ids))
           and not exists (
             select 1 from public.settlement_lines l
               join public.settlements s on s.id = l.settlement_id
              where l.vendor_id = ev.vendor_id and l.event_id = v_settlement.event_id
                and s.id <> v_settlement.id
                and s.status in ('draft', 'prepared', 'approved', 'releasing', 'completed_with_failures')
           )
         )
       )
  loop
    v_from := private.vendor_settled_until(v_settlement.event_id, v_vendor.vendor_id, v_settlement.id);
    select * into v_period
      from private.vendor_period(v_settlement.event_id, v_vendor.vendor_id, v_from,
                                 v_settlement.cutoff_at);
    select coalesce(sum(amount_ore), 0) into v_adjustments
      from public.settlement_adjustments
     where settlement_id = v_settlement.id and vendor_id = v_vendor.vendor_id
       and approved_by is not null;
    if v_period.entries = 0 and v_adjustments = 0 and not exists (
      select 1 from public.settlement_lines
       where settlement_id = v_settlement.id and vendor_id = v_vendor.vendor_id
    ) then
      continue;
    end if;
    if v_period.gross - v_period.refunds - v_period.commission - v_period.mva <> v_period.net then
      raise exception 'Ledger for vendor % does not add up', v_vendor.vendor_id
        using errcode = 'check_violation';
    end if;
    insert into public.settlement_lines (
      organization_id, event_id, settlement_id, event_vendor_id, vendor_id, gross_sales_ore,
      refunds_ore, commission_ore, commission_mva_ore, adjustments_ore, net_payout_ore,
      period_start, cutoff_at
    ) values (
      v_settlement.organization_id, v_settlement.event_id, v_settlement.id,
      v_vendor.event_vendor_id, v_vendor.vendor_id, v_period.gross, v_period.refunds,
      v_period.commission, v_period.mva, v_adjustments, v_period.net + v_adjustments, v_from,
      v_settlement.cutoff_at
    )
    on conflict (settlement_id, vendor_id) do update
       set gross_sales_ore = excluded.gross_sales_ore,
           refunds_ore = excluded.refunds_ore,
           commission_ore = excluded.commission_ore,
           commission_mva_ore = excluded.commission_mva_ore,
           adjustments_ore = excluded.adjustments_ore,
           net_payout_ore = excluded.net_payout_ore,
           period_start = excluded.period_start,
           cutoff_at = excluded.cutoff_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.prepare_settlement_lines(uuid, uuid[]) from public, anon;
grant execute on function private.prepare_settlement_lines(uuid, uuid[]) to authenticated, service_role;

-- Callable through the API; the work (and the staff check) is in the private function.
create function public.prepare_settlement_lines(p_settlement_id uuid, p_vendor_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.prepare_settlement_lines(p_settlement_id, p_vendor_ids);
$$;
revoke all on function public.prepare_settlement_lines(uuid, uuid[]) from public, anon;
grant execute on function public.prepare_settlement_lines(uuid, uuid[]) to authenticated, service_role;

-- Open reconciliation items for the event (Prompt 14 fills this in; none until then).
create function private.unreconciled_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select 0;
$$;
revoke all on function private.unreconciled_count(uuid) from public;

-- What stops a batch (SET-02): unreconciled transactions, open disputes, a payout account that
-- is not enabled, a negative balance, or no lines at all. Runs as the caller (RLS applies).
create function public.settlement_blockers(p_settlement_id uuid)
returns table (kind text, vendor_id uuid, event_vendor_id uuid, amount_ore bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (select * from public.settlements where id = p_settlement_id)
  select 'unreconciled', null::uuid, null::uuid, private.unreconciled_count(s.event_id)::bigint
    from s where private.unreconciled_count(s.event_id) > 0
  union all
  select 'no_lines', null, null, null
    from s where not exists (select 1 from public.settlement_lines l where l.settlement_id = s.id)
  union all
  select 'dispute', d.vendor_id, l.event_vendor_id, sum(d.amount_ore)::bigint
    from s
    join public.settlement_lines l on l.settlement_id = s.id
    join public.disputes d on d.vendor_id = l.vendor_id and d.event_id = s.event_id
   where d.status = 'open'
   group by d.vendor_id, l.event_vendor_id
  union all
  select 'payout_account', l.vendor_id, l.event_vendor_id, l.net_payout_ore
    from s
    join public.settlement_lines l on l.settlement_id = s.id
    join public.event_vendors ev on ev.id = l.event_vendor_id
   where l.net_payout_ore > 0
     and (ev.psp_account_status <> 'eligible' or ev.psp_account_id is null)
  union all
  select 'negative', l.vendor_id, l.event_vendor_id, l.net_payout_ore
    from s
    join public.settlement_lines l on l.settlement_id = s.id
   where l.net_payout_ore < 0;
$$;
revoke all on function public.settlement_blockers(uuid) from public, anon;
grant execute on function public.settlement_blockers(uuid) to authenticated, service_role;

create function private.check_settlement_blockers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('prepared', 'approved') and new.status is distinct from old.status
     and exists (select 1 from public.settlement_blockers(new.id)) then
    raise exception 'settlement_blocked' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.check_settlement_blockers() from public;

create trigger settlements_blockers before update of status on public.settlements
  for each row execute function private.check_settlement_blockers();

-- The workflow, now also allowing a retry of failed payouts (partially failed → paying).
create or replace function private.settlement_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A settlement starts as draft' using errcode = '23514';
    end if;
    new.created_by := coalesce(actor, new.created_by);
    new.prepared_by := null;
    new.prepared_at := null;
    new.approved_by := null;
    new.approved_at := null;
    return new;
  end if;

  if new.prepared_by is distinct from old.prepared_by
     or new.approved_by is distinct from old.approved_by then
    if actor is not null and new.status = old.status then
      raise exception 'Preparer and approver are set by the workflow' using errcode = '42501';
    end if;
  end if;

  if new.status = old.status then
    if actor is not null and old.status not in ('draft', 'prepared') then
      raise exception 'Settlement % is locked in status %', old.id, old.status
        using errcode = '42501';
    end if;
    if actor is not null and old.status = 'prepared' and new.cutoff_at <> old.cutoff_at then
      raise exception 'Settlement % is locked in status %', old.id, old.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('prepared', 'cancelled'))
    or (old.status = 'prepared' and new.status in ('draft', 'approved', 'cancelled'))
    or (old.status = 'approved' and new.status = 'releasing')
    or (old.status = 'releasing' and new.status in ('completed', 'completed_with_failures'))
    or (old.status = 'completed_with_failures' and new.status = 'releasing')
  ) then
    raise exception 'Settlement cannot move from % to %', old.status, new.status
      using errcode = '23514';
  end if;

  case new.status
    when 'prepared' then
      new.prepared_by := coalesce(actor, new.prepared_by);
      new.prepared_at := now();
      new.approved_by := null;
      new.approved_at := null;
    when 'draft' then
      new.prepared_by := null;
      new.prepared_at := null;
    when 'approved' then
      if actor is not null and not private.is_org_admin(new.organization_id) then
        raise exception 'Only an Organization Admin can approve a settlement'
          using errcode = '42501';
      end if;
      new.approved_by := coalesce(actor, new.approved_by);
      new.approved_at := now();
    when 'releasing', 'completed', 'completed_with_failures' then
      if actor is not null then
        raise exception 'Payouts are released by the server, not by users' using errcode = '42501';
      end if;
      if new.status <> 'releasing' then
        new.released_at := now();
      end if;
    else
      null;
  end case;
  return new;
end;
$$;

-- Adjustments are added and approved only while the batch is a draft (then the lines are
-- refreshed); the approver is an Organization Admin other than the creator (RLS + check).
create function private.guard_settlement_adjustment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and not private.settlement_is_draft(coalesce(new.settlement_id, old.settlement_id)) then
    raise exception 'not_draft' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_settlement_adjustment() from public;

create trigger settlement_adjustments_guard
  before insert or update or delete on public.settlement_adjustments
  for each row execute function private.guard_settlement_adjustment();

-- Release (SET-03), server code only ---------------------------------------------------------------
-- Moves an approved (or partially failed) batch to paying, posts its approved adjustments to the
-- ledger once, and creates one pending payout per line still unpaid. Returns what to pay.
create function public.begin_settlement_release(p_settlement_id uuid)
returns table (payout_id uuid, vendor_id uuid, psp_account_id text, amount_ore bigint, attempt integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.settlements;
  v_adjustment record;
begin
  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if v_settlement.status not in ('approved', 'completed_with_failures', 'releasing') then
    raise exception 'not_releasable' using errcode = 'check_violation';
  end if;
  if v_settlement.status <> 'releasing' then
    update public.settlements set status = 'releasing' where id = v_settlement.id;
  end if;

  for v_adjustment in
    select a.* from public.settlement_adjustments a
     where a.settlement_id = v_settlement.id and a.approved_by is not null
       and not exists (
         select 1 from public.ledger_entries e
          where e.settlement_id = v_settlement.id and e.entry_type = 'adjustment'
            and e.description = 'Adjustment ' || a.id
       )
  loop
    insert into public.ledger_entries (
      organization_id, event_id, transaction_id, entry_type, account, direction, amount_ore,
      vendor_id, settlement_id, description, created_by
    )
    select v_adjustment.organization_id, v_adjustment.event_id, t.tx, 'adjustment', a.account,
           a.direction, abs(v_adjustment.amount_ore), v_adjustment.vendor_id, v_settlement.id,
           'Adjustment ' || v_adjustment.id, v_adjustment.approved_by
      from (select gen_random_uuid() as tx) t,
           (values
             ('vendor_payable'::public.ledger_account,
              case when v_adjustment.amount_ore > 0 then 'credit' else 'debit' end::public.ledger_direction),
             ('adjustments'::public.ledger_account,
              case when v_adjustment.amount_ore > 0 then 'debit' else 'credit' end::public.ledger_direction)
           ) as a (account, direction);
  end loop;

  -- A new attempt for each line without a paid or in-flight payout.
  insert into public.payouts (
    organization_id, event_id, settlement_id, settlement_line_id, vendor_id, provider, amount_ore,
    attempt
  )
  select l.organization_id, l.event_id, l.settlement_id, l.id, l.vendor_id,
         coalesce((select p.provider from public.payments p
                    where p.vendor_id = l.vendor_id and p.event_id = l.event_id
                    order by p.created_at desc limit 1), 'mock'),
         l.net_payout_ore,
         coalesce((select max(po.attempt) from public.payouts po
                    where po.settlement_line_id = l.id), 0) + 1
    from public.settlement_lines l
   where l.settlement_id = v_settlement.id and l.net_payout_ore > 0
     and not exists (
       select 1 from public.payouts po
        where po.settlement_line_id = l.id and po.status in ('pending', 'in_transit', 'paid')
     );

  return query
    select po.id, po.vendor_id, ev.psp_account_id, po.amount_ore, po.attempt
      from public.payouts po
      join public.settlement_lines l on l.id = po.settlement_line_id
      join public.event_vendors ev on ev.id = l.event_vendor_id
     where po.settlement_id = v_settlement.id and po.status = 'pending';
end;
$$;

-- The provider's answer for one payout (idempotent). Paid: Dr vendor payable / Cr PSP clearing,
-- once. Then the batch is completed when every line is paid, or partially failed when none is
-- still on its way.
create function public.record_payout(
  p_payout_id uuid,
  p_provider_payout_id text,
  p_status public.payout_status,
  p_reason text
)
returns public.settlement_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.payouts;
  v_status public.settlement_status;
begin
  update public.payouts
     set provider_payout_id = coalesce(provider_payout_id, p_provider_payout_id),
         status = case when status in ('pending', 'in_transit') then p_status else status end,
         paid_at = case when status in ('pending', 'in_transit') and p_status = 'paid'
                        then now() else paid_at end,
         failure_reason = case when p_status = 'failed' then coalesce(nullif(trim(p_reason), ''), 'failed')
                               else failure_reason end
   where id = p_payout_id
  returning * into v_payout;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;

  if v_payout.status = 'paid' and not exists (
    select 1 from public.ledger_entries where payout_id = v_payout.id
  ) then
    insert into public.ledger_entries (
      organization_id, event_id, transaction_id, entry_type, account, direction, amount_ore,
      vendor_id, settlement_id, payout_id, description
    )
    select v_payout.organization_id, v_payout.event_id, t.tx, 'payout', a.account, a.direction,
           v_payout.amount_ore, v_payout.vendor_id, v_payout.settlement_id, v_payout.id,
           'Payout ' || coalesce(v_payout.provider_payout_id, v_payout.id::text)
      from (select gen_random_uuid() as tx) t,
           (values ('vendor_payable'::public.ledger_account, 'debit'::public.ledger_direction),
                   ('psp_clearing', 'credit')) as a (account, direction);
  end if;

  select status into v_status from public.settlements where id = v_payout.settlement_id for update;
  if v_status = 'releasing' and not exists (
    select 1 from public.payouts
     where settlement_id = v_payout.settlement_id and status in ('pending', 'in_transit')
  ) then
    v_status := case when exists (
        select 1 from public.settlement_lines l
         where l.settlement_id = v_payout.settlement_id and l.net_payout_ore > 0
           and not exists (select 1 from public.payouts po
                            where po.settlement_line_id = l.id and po.status = 'paid')
      ) then 'completed_with_failures' else 'completed' end;
    update public.settlements set status = v_status where id = v_payout.settlement_id;
  end if;
  return v_status;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.record_dispute(public.payment_provider, text, text, bigint, text, public.dispute_status)',
    'public.begin_settlement_release(uuid)',
    'public.record_payout(uuid, text, public.payout_status, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Payout results from the provider's webhook also complete the batch.
create or replace function public.record_payout_result(
  p_provider_payout_id text,
  p_paid boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.payouts where provider_payout_id = p_provider_payout_id;
  if v_id is null then
    return false;
  end if;
  perform public.record_payout(
    v_id, p_provider_payout_id,
    case when p_paid then 'paid' else 'failed' end::public.payout_status, p_reason
  );
  return true;
end;
$$;

-- In settlement (SET-01): unpaid net of lines in a batch that is ready, approved or paying.
create or replace function public.vendor_balances(p_event_id uuid)
returns table (
  vendor_id uuid,
  lifetime_ore bigint,
  in_settlement_ore bigint,
  paid_ore bigint,
  pending_ore bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ledger as (
    select e.vendor_id,
           sum(case when e.direction = 'credit' then e.amount_ore else -e.amount_ore end)
             filter (where e.entry_type <> 'payout') as lifetime,
           coalesce(sum(e.amount_ore) filter (where e.entry_type = 'payout'
                                              and e.direction = 'debit'), 0) as paid
      from public.ledger_entries e
     where e.event_id = p_event_id and e.account = 'vendor_payable' and e.vendor_id is not null
     group by e.vendor_id
  ),
  settling as (
    select l.vendor_id, sum(l.net_payout_ore) as amount
      from public.settlement_lines l
      join public.settlements s on s.id = l.settlement_id
     where l.event_id = p_event_id
       and s.status in ('prepared', 'approved', 'releasing', 'completed_with_failures')
       and not exists (select 1 from public.payouts po
                        where po.settlement_line_id = l.id and po.status = 'paid')
     group by l.vendor_id
  )
  select ledger.vendor_id,
         coalesce(ledger.lifetime, 0)::bigint,
         greatest(0, least(coalesce(settling.amount, 0),
                           coalesce(ledger.lifetime, 0) - ledger.paid))::bigint,
         ledger.paid::bigint,
         (coalesce(ledger.lifetime, 0) - ledger.paid
          - greatest(0, least(coalesce(settling.amount, 0),
                              coalesce(ledger.lifetime, 0) - ledger.paid)))::bigint
    from ledger
    left join settling on settling.vendor_id = ledger.vendor_id;
$$;
