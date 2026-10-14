-- P07 stalls and stall fees (STL-01 … STL-04).

-- Venue image for the layout view (STL-03). Public image (owner decision P07); pins are on stalls.
alter table public.events add column venue_map_path text;
grant select (venue_map_path) on public.events to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('event-media', 'event-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Event whose folder holds the object, or null.
create function private.storage_event_id(object_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when split_part(object_name, '/', 1)
                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end;
$$;

create function private.can_manage_event(event uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = event and private.is_event_staff(e.organization_id, e.id)
  );
$$;
revoke all on function private.storage_event_id(text) from public;
revoke all on function private.can_manage_event(uuid) from public;
grant execute on function private.storage_event_id(text), private.can_manage_event(uuid)
  to authenticated;

create policy event_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-media' and private.can_manage_event(private.storage_event_id(name))
  );
create policy event_files_update on storage.objects for update to authenticated
  using (bucket_id = 'event-media' and private.can_manage_event(private.storage_event_id(name)))
  with check (
    bucket_id = 'event-media' and private.can_manage_event(private.storage_event_id(name))
  );
create policy event_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-media' and private.can_manage_event(private.storage_event_id(name)));

-- Event staff set the venue image; the events table itself stays Organization Admin only.
create function private.set_venue_map(p_event_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_event(p_event_id) then
    raise exception 'Only event staff can change the venue image'
      using errcode = 'insufficient_privilege';
  end if;
  if p_path is not null and private.storage_event_id(p_path) is distinct from p_event_id then
    raise exception 'The image must be stored in the event''s folder' using errcode = 'check_violation';
  end if;
  update public.events set venue_map_path = p_path where id = p_event_id;
end;
$$;
revoke all on function private.set_venue_map(uuid, text) from public;
grant execute on function private.set_venue_map(uuid, text) to authenticated;

create function public.set_venue_map(p_event_id uuid, p_path text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_venue_map(p_event_id, p_path);
$$;
revoke all on function public.set_venue_map(uuid, text) from public, anon;
grant execute on function public.set_venue_map(uuid, text) to authenticated;

-- Stall assignment (STL-02) ---------------------------------------------------------------------
-- Assign, reassign (the previous stall is released) or release, in one transaction and audited.
create trigger stall_assignments_audit after insert or update or delete on public.stall_assignments
  for each row execute function private.audit_change();

create function private.assign_stall(p_event_vendor_id uuid, p_stall_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_ev public.event_vendors;
  v_stall public.stalls;
  v_assignment_id uuid;
begin
  select * into v_ev from public.event_vendors where id = p_event_vendor_id for update;
  if v_actor is null or not found
     or not private.is_event_staff(v_ev.organization_id, v_ev.event_id) then
    raise exception 'Only event staff can assign stalls' using errcode = 'insufficient_privilege';
  end if;
  if v_ev.status <> 'approved' then
    raise exception 'Only approved vendors get a stall' using errcode = 'check_violation';
  end if;
  if p_stall_id is not null then
    select * into v_stall from public.stalls where id = p_stall_id;
    if not found or v_stall.event_id <> v_ev.event_id then
      raise exception 'The stall is not part of this event' using errcode = 'check_violation';
    end if;
  end if;

  update public.stall_assignments
     set status = 'released', released_at = now()
   where event_vendor_id = v_ev.id and status = 'active'
     and stall_id is distinct from p_stall_id;

  if p_stall_id is not null then
    select id into v_assignment_id from public.stall_assignments
     where event_vendor_id = v_ev.id and stall_id = p_stall_id and status = 'active';
    if v_assignment_id is null then
      insert into public.stall_assignments (
        organization_id, event_id, stall_id, event_vendor_id, vendor_id, assigned_by
      ) values (
        v_ev.organization_id, v_ev.event_id, p_stall_id, v_ev.id, v_ev.vendor_id, v_actor
      ) returning id into v_assignment_id;
    end if;
  end if;

  update public.stall_fees set stall_id = p_stall_id
   where event_vendor_id = v_ev.id and status <> 'cancelled';
  return v_assignment_id;
end;
$$;
revoke all on function private.assign_stall(uuid, uuid) from public;
grant execute on function private.assign_stall(uuid, uuid) to authenticated;

create function public.assign_stall(p_event_vendor_id uuid, p_stall_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.assign_stall(p_event_vendor_id, p_stall_id);
$$;
revoke all on function public.assign_stall(uuid, uuid) from public, anon;
grant execute on function public.assign_stall(uuid, uuid) to authenticated;

-- Stall fee payment (STL-04) --------------------------------------------------------------------
-- Called by server code when the payment provider confirms a payment (webhook). Idempotent per
-- provider payment id. AFFN's own revenue: recorded in fee_payments, never in the vendor ledger.
create function public.record_fee_payment(
  p_stall_fee_id uuid,
  p_provider public.payment_provider,
  p_provider_payment_id text,
  p_amount_ore bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee public.stall_fees;
  v_payment_id uuid;
begin
  select id into v_payment_id from public.fee_payments
   where provider_payment_id = p_provider_payment_id;
  if found then
    return v_payment_id;
  end if;

  select * into v_fee from public.stall_fees where id = p_stall_fee_id for update;
  if not found then
    raise exception 'Unknown stall fee' using errcode = 'no_data_found';
  end if;
  if v_fee.status not in ('open', 'invoiced') then
    raise exception 'Stall fee % is %', v_fee.id, v_fee.status using errcode = 'check_violation';
  end if;
  if p_amount_ore <> v_fee.total_ore then
    raise exception 'Paid % øre, expected % øre', p_amount_ore, v_fee.total_ore
      using errcode = 'check_violation';
  end if;

  insert into public.fee_payments (
    organization_id, event_id, stall_fee_id, vendor_id, provider, provider_payment_id, amount_ore
  ) values (
    v_fee.organization_id, v_fee.event_id, v_fee.id, v_fee.vendor_id, p_provider,
    p_provider_payment_id, p_amount_ore
  ) returning id into v_payment_id;

  update public.stall_fees set status = 'paid', paid_at = now() where id = v_fee.id;
  update public.invoices set status = 'paid'
   where stall_fee_id = v_fee.id and status = 'issued';
  return v_payment_id;
end;
$$;
revoke all on function public.record_fee_payment(uuid, public.payment_provider, text, bigint)
  from public, anon, authenticated;
grant execute on function public.record_fee_payment(uuid, public.payment_provider, text, bigint)
  to service_role;
