-- P06 review centre (REV-01 … REV-03, SYS-01 for review actions).

-- Audit reason from the acting code: functions that make a decision set the transaction setting
-- `affn.audit_reason` so the audit row for that change carries the note. Rows that have their own
-- `reason` column (e.g. commission_rules) keep using it.
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
    auth.uid(),
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

-- One audit row per review action: the application's status change (before/after, actor, note).
-- The review history row itself is the vendor-facing record, so it is not audited twice.
alter table public.application_reviews disable trigger application_reviews_audit;

-- One open stall fee per participation.
create unique index stall_fees_one_open_per_vendor
  on public.stall_fees (event_vendor_id) where status <> 'cancelled';

-- Review decision (REV-02). Event staff only; every decision needs a note. Approval also issues
-- the stall fee and its invoice (STL-04) and may set a vendor-specific commission rate
-- (Organization Admin only, with a reason: COM-03). One transaction. The privileged work lives in
-- schema private (not exposed by the API); public.review_application is the callable wrapper.
create function private.review_application(
  p_event_vendor_id uuid,
  p_decision public.application_status,
  p_note text,
  p_commission_rate_bp integer default null,
  p_commission_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_ev public.event_vendors;
  v_fee bigint;
  v_mva bigint;
  v_stall_fee_id uuid;
  v_invoice_id uuid;
  v_invoice_number bigint;
  v_rule_id uuid;
begin
  select * into v_ev from public.event_vendors where id = p_event_vendor_id for update;
  if v_actor is null or not found
     or not private.is_event_staff(v_ev.organization_id, v_ev.event_id) then
    raise exception 'Only event staff can review applications'
      using errcode = 'insufficient_privilege';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A note is required' using errcode = 'check_violation';
  end if;

  if not (
    (p_decision = 'under_review' and v_ev.status = 'submitted')
    or (p_decision in ('approved', 'rejected', 'waitlisted', 'more_info_requested')
        and v_ev.status in ('submitted', 'under_review', 'waitlisted')
        and p_decision <> v_ev.status)
  ) then
    raise exception 'An application in status % cannot be moved to %', v_ev.status, p_decision
      using errcode = 'check_violation';
  end if;

  if p_commission_rate_bp is not null then
    if p_decision <> 'approved' then
      raise exception 'A commission rate is set on approval' using errcode = 'check_violation';
    end if;
    if not private.is_org_admin(v_ev.organization_id) then
      raise exception 'Only an Organization Admin can change commission'
        using errcode = 'insufficient_privilege';
    end if;
    if p_commission_reason is null or length(trim(p_commission_reason)) = 0 then
      raise exception 'A reason is required for a commission change'
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('affn.audit_reason', trim(p_note), true);
  update public.event_vendors set status = p_decision where id = v_ev.id;
  perform set_config('affn.audit_reason', '', true);

  insert into public.application_reviews (
    organization_id, event_id, event_vendor_id, vendor_id, from_status, to_status, note, actor_id
  ) values (
    v_ev.organization_id, v_ev.event_id, v_ev.id, v_ev.vendor_id, v_ev.status, p_decision,
    trim(p_note), v_actor
  );

  if p_decision = 'approved' then
    select st.fee_ore into v_fee from public.stall_types st where st.id = v_ev.stall_type_id;
    if v_fee is null then
      raise exception 'The application has no stall type' using errcode = 'check_violation';
    end if;
    -- 25 % mva on the stall fee (owner decision P06), rounded half-up to whole øre.
    v_mva := (v_fee * 2500 * 2 + 10000) / 20000;

    insert into public.stall_fees (
      organization_id, event_id, event_vendor_id, vendor_id, amount_ore, mva_ore, total_ore,
      status, due_at, created_by
    ) values (
      v_ev.organization_id, v_ev.event_id, v_ev.id, v_ev.vendor_id, v_fee, v_mva, v_fee + v_mva,
      'invoiced', now() + interval '14 days', v_actor
    ) returning id into v_stall_fee_id;

    insert into public.invoices (
      organization_id, event_id, kind, vendor_id, stall_fee_id, subtotal_ore, mva_ore,
      total_ore, due_at
    ) values (
      v_ev.organization_id, v_ev.event_id, 'stall_fee', v_ev.vendor_id, v_stall_fee_id, v_fee,
      v_mva, v_fee + v_mva, now() + interval '14 days'
    ) returning id, invoice_number into v_invoice_id, v_invoice_number;

    if p_commission_rate_bp is not null then
      insert into public.commission_rules (
        organization_id, scope, event_id, vendor_id, type, rate_bp, effective_from, reason,
        created_by
      ) values (
        v_ev.organization_id, 'vendor', v_ev.event_id, v_ev.vendor_id, 'percentage',
        p_commission_rate_bp, now(), trim(p_commission_reason), v_actor
      ) returning id into v_rule_id;
    end if;
  end if;

  return jsonb_build_object(
    'status', p_decision,
    'stall_fee_id', v_stall_fee_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'commission_rule_id', v_rule_id
  );
end;
$$;
revoke all on function private.review_application(uuid, public.application_status, text, integer, text)
  from public, anon;
grant execute on function private.review_application(uuid, public.application_status, text, integer, text)
  to authenticated;

create function public.review_application(
  p_event_vendor_id uuid,
  p_decision public.application_status,
  p_note text,
  p_commission_rate_bp integer default null,
  p_commission_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.review_application(
    p_event_vendor_id, p_decision, p_note, p_commission_rate_bp, p_commission_reason
  );
$$;
revoke all on function public.review_application(uuid, public.application_status, text, integer, text)
  from public, anon;
grant execute on function public.review_application(uuid, public.application_status, text, integer, text)
  to authenticated;
