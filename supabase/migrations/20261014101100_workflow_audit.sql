-- Settlement workflow (SET-02) and audit trail (SYS-01).

-- Who is acting: the signed-in user, or null for server code using the service role.
-- Settlement transitions:
--   draft ⇄ prepared → approved → releasing → completed | completed_with_failures
--   draft | prepared → cancelled
-- Users may prepare, return to draft, cancel and approve; releasing and completing are done by
-- server code after the payment provider confirms. Approval needs an Organization Admin other
-- than the preparer (four-eyes; the check constraint on settlements is the final guard).
create function private.settlement_workflow()
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
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('prepared', 'cancelled'))
    or (old.status = 'prepared' and new.status in ('draft', 'approved', 'cancelled'))
    or (old.status = 'approved' and new.status = 'releasing')
    or (old.status = 'releasing' and new.status in ('completed', 'completed_with_failures'))
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

create trigger settlements_workflow before insert or update on public.settlements
  for each row execute function private.settlement_workflow();

-- Generic audit trigger. Optional argument: a column name; updates are then logged only when that
-- column changes (e.g. status), which keeps the log to decisions rather than every edit.
create function private.audit_change()
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
    rec ->> 'reason'
  );
  return null;
end;
$$;
revoke all on function private.audit_change() from public;
revoke all on function private.settlement_workflow() from public;

do $$
declare
  spec text[];
begin
  -- {table, operations, watched column or ''}
  foreach spec slice 1 in array array[
    ['platform_admins',        'insert or update or delete', ''],
    ['memberships',            'insert or update or delete', ''],
    ['event_admins',           'insert or update or delete', ''],
    ['commission_rules',       'insert or update or delete', ''],
    ['event_vendors',          'update',                     'status'],
    ['application_reviews',    'insert',                     ''],
    ['vendor_documents',       'update',                     'status'],
    ['settlements',            'insert or update',           'status'],
    ['settlement_lines',       'insert or update or delete', ''],
    ['settlement_adjustments', 'insert or update or delete', ''],
    ['payments',               'insert or update',           'status'],
    ['refunds',                'insert or update',           'status'],
    ['payouts',                'insert or update',           'status'],
    ['invoices',               'insert or update',           'status'],
    ['stall_fees',             'insert or update',           'status'],
    ['fee_payments',           'insert',                     ''],
    ['sponsorships',           'insert or update',           'status'],
    ['sponsor_assets',         'update',                     'status']
  ]
  loop
    execute format(
      'create trigger %I after %s on public.%I for each row execute function private.audit_change(%s)',
      spec[1] || '_audit', spec[2], spec[1],
      case when spec[3] = '' then '' else quote_literal(spec[3]) end
    );
  end loop;
end;
$$;
