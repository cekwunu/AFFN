-- P11 Orders, kitchen display and order tracking (ORD-01 … ORD-04).

alter table public.orders
  -- Code shown to the kitchen and the customer (ORD-01): festival day letter, stall number and the
  -- vendor's order number for that day, e.g. "B·14-007" (day B, stall 14, 7th order). Kept as
  -- issued so receipts never change.
  add column order_code text,
  add column preparing_at timestamptz,
  add column cancel_reason text;
comment on column public.orders.cancel_reason is 'Why the vendor cancelled (shown to the customer)';

-- Day letter: A for the festival's first day (Oslo date of events.starts_at), B the next, and so
-- on; T (test) for orders outside the festival days.
create function private.order_code(
  p_event_id uuid,
  p_event_vendor_id uuid,
  p_service_date date,
  p_number integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (select chr(65 + (p_service_date - (e.starts_at at time zone 'Europe/Oslo')::date))
         from public.events e
        where e.id = p_event_id
          and e.starts_at is not null
          and p_service_date >= (e.starts_at at time zone 'Europe/Oslo')::date
          and p_service_date <= coalesce((e.ends_at at time zone 'Europe/Oslo')::date,
                                         (e.starts_at at time zone 'Europe/Oslo')::date)
          and p_service_date - (e.starts_at at time zone 'Europe/Oslo')::date < 19),
      'T'
    )
    || coalesce(
      (select '·' || s.number
         from public.stall_assignments sa
         join public.stalls s on s.id = sa.stall_id
        where sa.event_vendor_id = p_event_vendor_id and sa.status = 'active'
        order by sa.assigned_at desc
        limit 1),
      ''
    )
    || '-' || lpad(p_number::text, 3, '0');
$$;
revoke all on function private.order_code(uuid, uuid, date, integer) from public;

create or replace function private.assign_order_number()
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
  new.order_code := private.order_code(
    new.event_id, new.event_vendor_id, new.service_date, new.order_number
  );
  return new;
end;
$$;

update public.orders
   set order_code = private.order_code(event_id, event_vendor_id, service_date, order_number)
 where order_code is null;
alter table public.orders alter column order_code set not null;

-- Vendors move their orders through the kitchen one step at a time (ORD-01, ORD-02); the
-- timestamps are set here, never by the client. Cancelling goes through server code, which
-- refunds the customer (ORD-04). Service role and owner (server code, webhooks) are not limited.
create function private.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('new'::public.order_status, 'accepted'::public.order_status),
      ('accepted', 'preparing'),
      ('preparing', 'ready'),
      ('ready', 'collected')
    ) then
      raise exception 'invalid_transition' using errcode = 'check_violation',
        detail = format('%s → %s', old.status, new.status);
    end if;
  end if;
  new.accepted_at := case when new.status = 'accepted' and old.status <> 'accepted'
                          then now() else old.accepted_at end;
  new.preparing_at := case when new.status = 'preparing' and old.status <> 'preparing'
                           then now() else old.preparing_at end;
  new.ready_at := case when new.status = 'ready' and old.status <> 'ready'
                       then now() else old.ready_at end;
  new.collected_at := case when new.status = 'collected' and old.status <> 'collected'
                           then now() else old.collected_at end;
  new.cancelled_at := old.cancelled_at;
  return new;
end;
$$;
revoke all on function private.guard_order_update() from public;

create trigger orders_guard_update before update on public.orders
  for each row execute function private.guard_order_update();

create trigger orders_audit after update on public.orders
  for each row execute function private.audit_change('status');

-- Vendor cancels a paid order (ORD-04): the order is cancelled and a pending full refund is
-- recorded in the same transaction; server code then asks the payment provider to refund and
-- completes it with record_order_refund. Calling it again returns the same refund.
create function public.begin_order_cancellation(p_order_id uuid, p_reason text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_refund public.refunds;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'check_violation';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  select * into v_payment from public.payments
   where order_id = v_order.id and status = 'succeeded'
   order by succeeded_at desc limit 1;

  if v_order.status = 'cancelled' then
    -- Called again (retry): the refund already requested, unless it failed.
    select * into v_refund from public.refunds
     where order_id = v_order.id and status <> 'failed' and created_at >= v_order.cancelled_at
     order by created_at desc limit 1;
    if v_refund.id is null and v_payment.id is null then
      raise exception 'not_paid' using errcode = 'check_violation';
    end if;
  elsif v_order.status not in ('new', 'accepted', 'preparing', 'ready') or v_payment.id is null then
    raise exception 'not_cancellable' using errcode = 'check_violation';
  else
    perform set_config('affn.audit_actor', coalesce(p_user::text, ''), true);
    perform set_config('affn.audit_reason', trim(p_reason), true);
    update public.orders
       set status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason)
     where id = v_order.id;
  end if;

  -- A full refund of whatever is not refunded yet (earlier refunds, done or in flight, count).
  if v_refund.id is null then
    insert into public.refunds (
      organization_id, event_id, payment_id, order_id, vendor_id, amount_ore,
      platform_fee_reversal_ore, reason, requested_by
    )
    select v_order.organization_id, v_order.event_id, v_payment.id, v_order.id,
           v_order.vendor_id,
           v_payment.amount_ore - coalesce(sum(r.amount_ore), 0),
           v_payment.platform_fee_ore - coalesce(sum(r.platform_fee_reversal_ore), 0),
           trim(p_reason), p_user
      from public.refunds r
     where r.payment_id = v_payment.id and r.status <> 'failed'
    having v_payment.amount_ore - coalesce(sum(r.amount_ore), 0) > 0
    returning * into v_refund;
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'refund_id', v_refund.id,
    'refund_status', v_refund.status,
    'amount_ore', v_refund.amount_ore,
    'platform_fee_reversal_ore', v_refund.platform_fee_reversal_ore,
    'provider', v_payment.provider,
    'provider_payment_id', v_payment.provider_payment_id
  );
end;
$$;

-- The provider's answer to the refund request (idempotent): keeps the provider's id and the fee
-- it reversed; status follows the provider.
create function public.record_order_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_succeeded boolean,
  p_platform_fee_reversal_ore bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.refunds
     set provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id),
         platform_fee_reversal_ore = case when status = 'pending'
                                          then p_platform_fee_reversal_ore
                                          else platform_fee_reversal_ore end,
         status = case when status = 'pending'
                       then (case when p_succeeded then 'succeeded' else 'failed' end)::public.refund_status
                       else status end,
         succeeded_at = case when status = 'pending' and p_succeeded then now() else succeeded_at end
   where id = p_refund_id;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.begin_order_cancellation(uuid, text, uuid)',
    'public.record_order_refund(uuid, text, boolean, bigint)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Live updates (ORD-02, ORD-03). The kitchen listens to row changes (RLS applies); the
-- customer's tracking page, which has no account, listens to a broadcast topic named after the
-- order's secret tracking token.
alter publication supabase_realtime add table public.orders;

create function private.broadcast_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('status', new.status),
    'status',
    'order:' || new.tracking_token,
    false
  );
  return null;
end;
$$;
revoke all on function private.broadcast_order_status() from public;

create trigger orders_broadcast_status after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function private.broadcast_order_status();

create index orders_event_vendor_status_idx on public.orders (event_vendor_id, status, paid_at);
