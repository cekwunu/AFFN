-- P09 payment provider adapter and vendor payment onboarding (PRD §5, VEN-06).
-- All functions here are called by server code with the service role (webhooks, checkout).

-- Audit actor for changes made by server code on someone's behalf: functions run with the
-- service role set `affn.audit_actor` so the audit row still names the person.
create or replace function private.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  watched text := tg_argv[0];
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if tg_op = 'UPDATE' and watched is not null
     and (to_jsonb(old) ->> watched) is not distinct from (to_jsonb(new) ->> watched) then
    return null;
  end if;

  insert into public.audit_log (
    organization_id, event_id, actor_id, actor_role, table_name, row_id, action,
    old_data, new_data, reason
  ) values (
    (rec ->> 'organization_id')::uuid,
    (rec ->> 'event_id')::uuid,
    coalesce(auth.uid(), nullif(current_setting('affn.audit_actor', true), '')::uuid),
    coalesce(claims ->> 'role', session_user),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'user_id', rec ->> 'vendor_id'),
    lower(tg_op)::public.audit_action,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    coalesce(rec ->> 'reason', nullif(current_setting('affn.audit_reason', true), ''))
  );
  return null;
end;
$$;

-- Payment account status changes are audited (who started onboarding, when it was enabled).
create trigger event_vendors_psp_audit after update on public.event_vendors
  for each row execute function private.audit_change('psp_account_status');

-- Vendor payment onboarding (VEN-06) ---------------------------------------------------------------
-- Links the provider account to the participation when the vendor starts onboarding.
create function public.set_payment_account(
  p_event_vendor_id uuid,
  p_account_id text,
  p_status public.psp_account_status,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.event_vendors;
begin
  select * into v_ev from public.event_vendors where id = p_event_vendor_id for update;
  if not found then
    raise exception 'Unknown participation' using errcode = 'no_data_found';
  end if;
  if v_ev.status <> 'approved' then
    raise exception 'Payment onboarding starts after approval' using errcode = 'check_violation';
  end if;
  if v_ev.psp_account_id is not null and v_ev.psp_account_id <> p_account_id then
    raise exception 'The participation already has a payment account'
      using errcode = 'check_violation';
  end if;
  perform set_config('affn.audit_actor', coalesce(p_actor::text, ''), true);
  update public.event_vendors
     set psp_account_id = p_account_id,
         psp_account_status = case
           when psp_account_status = 'not_started' then p_status
           else psp_account_status
         end
   where id = v_ev.id;
  perform set_config('affn.audit_actor', '', true);
end;
$$;

-- Status reported by the provider (webhook or a status check). Returns the rows updated.
create function public.set_payment_account_status(
  p_account_id text,
  p_status public.psp_account_status
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.event_vendors
     set psp_account_status = p_status
   where psp_account_id = p_account_id and psp_account_status is distinct from p_status;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Order payments (checkout, Prompt 10) ------------------------------------------------------------
-- Payment result from the provider. Idempotent: a repeat changes nothing, and a success is
-- never undone by a later failure. Amounts must match what checkout asked for.
create function public.record_order_payment(
  p_provider public.payment_provider,
  p_provider_payment_id text,
  p_succeeded boolean,
  p_method public.payment_method,
  p_amount_ore bigint,
  p_platform_fee_ore bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments
   where provider = p_provider and provider_payment_id = p_provider_payment_id
   for update;
  if not found then
    raise exception 'Unknown payment %', p_provider_payment_id using errcode = 'no_data_found';
  end if;

  if p_succeeded then
    if v_payment.status = 'succeeded' then
      return v_payment.order_id;
    end if;
    if p_amount_ore <> v_payment.amount_ore or p_platform_fee_ore <> v_payment.platform_fee_ore then
      raise exception 'Paid % øre with fee %, expected % with fee %', p_amount_ore,
        p_platform_fee_ore, v_payment.amount_ore, v_payment.platform_fee_ore
        using errcode = 'check_violation';
    end if;
    update public.payments
       set status = 'succeeded', method = p_method, succeeded_at = now(), failure_reason = null
     where id = v_payment.id;
    update public.orders
       set status = 'new', paid_at = now(), cancelled_at = null
     where id = v_payment.order_id and status in ('pending_payment', 'cancelled');
  else
    if v_payment.status in ('succeeded', 'failed') then
      return v_payment.order_id;
    end if;
    update public.payments
       set status = 'failed', method = coalesce(p_method, method),
           failure_reason = coalesce(nullif(trim(p_reason), ''), 'failed')
     where id = v_payment.id;
    update public.orders
       set status = 'cancelled', cancelled_at = now()
     where id = v_payment.order_id and status = 'pending_payment';
  end if;
  return v_payment.order_id;
end;
$$;

-- Refund and payout results reported by the provider. Return false when we have no such row.
create function public.record_refund_result(p_provider_refund_id text, p_succeeded boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.refunds
     set status = case when p_succeeded then 'succeeded' else 'failed' end::public.refund_status,
         succeeded_at = case when p_succeeded then coalesce(succeeded_at, now()) end
   where provider_refund_id = p_provider_refund_id and status = 'pending';
  return exists (select 1 from public.refunds where provider_refund_id = p_provider_refund_id);
end;
$$;

create function public.record_payout_result(
  p_provider_payout_id text,
  p_paid boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payouts
     set status = case when p_paid then 'paid' else 'failed' end::public.payout_status,
         paid_at = case when p_paid then coalesce(paid_at, now()) end,
         failure_reason = case when p_paid then null else coalesce(p_reason, 'failed') end
   where provider_payout_id = p_provider_payout_id and status in ('pending', 'in_transit');
  return exists (select 1 from public.payouts where provider_payout_id = p_provider_payout_id);
end;
$$;

-- Server code only (webhooks, checkout, onboarding actions).
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_payment_account(uuid, text, public.psp_account_status, uuid)',
    'public.set_payment_account_status(text, public.psp_account_status)',
    'public.record_order_payment(public.payment_provider, text, boolean, public.payment_method, bigint, bigint, text)',
    'public.record_refund_result(text, boolean)',
    'public.record_payout_result(text, boolean, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
