-- P05 vendor onboarding (VEN-01 … VEN-05).

-- Vendor categories (owner decision P05). Food categories need Mattilsynet registration proof.
update public.vendors set category = case category
  when 'food' then 'hot-food'
  when 'drinks' then 'drinks-coffee'
  else category end
 where category in ('food', 'drinks');
alter table public.vendors
  add constraint vendors_category_check check (category in (
    'hot-food', 'street-food', 'bakery-desserts', 'drinks-coffee',
    'groceries-spices', 'fashion-crafts', 'beauty-wellness', 'other'
  ));

create function private.is_food_category(category text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select category in ('hot-food', 'street-food', 'bakery-desserts', 'drinks-coffee');
$$;

-- Registry address (public data from Brønnøysundregistrene, not personal data).
alter table public.vendors
  add column business_address text,
  add column postal_code text check (postal_code ~ '^[0-9]{4}$'),
  add column city text;

-- Key dates shown on "Become a vendor" (VEN-01).
alter table public.events
  add column applications_open_at timestamptz,
  add column application_deadline timestamptz,
  add column decisions_by timestamptz,
  add constraint events_application_dates_check check (
    application_deadline is null or applications_open_at is null
    or application_deadline > applications_open_at
  );
grant select (applications_open_at, application_deadline, decisions_by) on public.events to anon;

-- Stall types and fees per event --------------------------------------------------------------
create table public.stall_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  name_nb text not null check (length(trim(name_nb)) > 0),
  name_en text not null check (length(trim(name_en)) > 0),
  description_nb text,
  description_en text,
  size_label text not null,
  width_cm integer check (width_cm > 0),
  depth_cm integer check (depth_cm > 0),
  fee_ore bigint not null check (fee_ore >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
create index stall_types_event_org_idx on public.stall_types (event_id, organization_id);
create index stall_types_organization_id_idx on public.stall_types (organization_id);
create trigger stall_types_updated_at before update on public.stall_types
  for each row execute function private.set_updated_at();
create trigger stall_types_audit after insert or update or delete on public.stall_types
  for each row execute function private.audit_change();

alter table public.stall_types enable row level security;
grant select, insert, update, delete on public.stall_types to authenticated;
grant select (
  id, organization_id, event_id, name_nb, name_en, description_nb, description_en, size_label,
  width_cm, depth_cm, fee_ore, sort_order
) on public.stall_types to anon;

create policy stall_types_select on public.stall_types for select to authenticated
  using (
    (select private.is_platform_owner())
    or organization_id = any ((select private.my_org_ids())::uuid[])
  );
create policy stall_types_insert on public.stall_types for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy stall_types_update on public.stall_types for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));
create policy stall_types_delete on public.stall_types for delete to authenticated
  using (private.is_org_admin(organization_id));
create policy stall_types_public on public.stall_types for select to anon
  using (private.event_is_public(event_id));

-- Application fields on the participation -----------------------------------------------------
alter table public.event_vendors
  add column stall_type_id uuid,
  add column preferred_zone text,
  -- {"completed": ["business", …], "drafts": {"contact": {…}}}: autosaved input that is not yet
  -- valid, so a vendor can leave mid-step and resume (VEN-04).
  add column application_progress jsonb not null default '{}'::jsonb,
  add constraint event_vendors_stall_type_fkey foreign key (stall_type_id, event_id)
    references public.stall_types (id, event_id) on delete restrict;
create index event_vendors_stall_type_idx on public.event_vendors (stall_type_id, event_id);
grant update (stall_type_id, preferred_zone, application_progress) on public.event_vendors
  to authenticated;
comment on column public.event_vendors.application_progress is
  'May hold PERSONAL DATA (draft contact details) until the step is saved.';

alter table public.vendor_documents add column description text;

-- Status rules (VEN-04, VEN-05) ----------------------------------------------------------------
-- Vendors may only submit (from draft, or after more info was requested). Submitting needs an
-- accepted agreement and, for food vendors, a Mattilsynet document. Approval needs the agreement.
create function private.event_vendor_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff boolean := (select auth.uid()) is null
    or private.is_event_staff(new.organization_id, new.event_id)
    or private.is_platform_owner();
  category text;
begin
  if tg_op = 'INSERT' then
    if not staff and new.status <> 'draft' then
      raise exception 'A new application starts as a draft'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if not staff and not (
    new.status = 'submitted' and old.status in ('draft', 'more_info_requested')
  ) then
    raise exception 'Vendors can only submit their application'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status in ('submitted', 'approved') and not exists (
    select 1 from public.vendor_agreements a where a.event_vendor_id = new.id
  ) then
    raise exception 'The vendor agreement must be accepted first' using errcode = 'check_violation';
  end if;

  if new.status = 'submitted' then
    select v.category into category from public.vendors v where v.id = new.vendor_id;
    if private.is_food_category(category) and not exists (
      select 1 from public.vendor_documents d
       where d.vendor_id = new.vendor_id and d.document_type = 'mattilsynet_registration'
         and d.status <> 'rejected'
    ) then
      raise exception 'Food vendors must upload Mattilsynet registration'
        using errcode = 'check_violation';
    end if;
    new.submitted_at := now();
  end if;

  if new.status in ('approved', 'rejected', 'waitlisted') then
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end;
$$;
revoke all on function private.event_vendor_transition() from public;
create trigger event_vendors_transition before insert or update on public.event_vendors
  for each row execute function private.event_vendor_transition();

-- Agreement acceptance is a consent record: never changed or removed, always audited.
create trigger vendor_agreements_append_only before update or delete on public.vendor_agreements
  for each row execute function private.prevent_mutation();
create trigger vendor_agreements_no_truncate before truncate on public.vendor_agreements
  for each statement execute function private.prevent_mutation();
create trigger vendor_agreements_audit after insert on public.vendor_agreements
  for each row execute function private.audit_change();

-- Brønnøysundregistrene cache (VEN-02) ----------------------------------------------------------
-- Public registry data about businesses; no tenant, no personal data. Server code only.
create table private.brreg_lookups (
  org_number char(9) primary key check (org_number ~ '^[0-9]{9}$'),
  status text not null,
  payload jsonb,
  fetched_at timestamptz not null default now()
);

create function public.brreg_cache_get(p_org_number text, p_max_age_seconds integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('status', b.status, 'payload', b.payload, 'fetched_at', b.fetched_at)
    from private.brreg_lookups b
   where b.org_number = p_org_number
     and b.fetched_at > now() - make_interval(secs => p_max_age_seconds);
$$;

create function public.brreg_cache_put(p_org_number text, p_status text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.brreg_lookups (org_number, status, payload, fetched_at)
  values (p_org_number, p_status, p_payload, now())
  on conflict (org_number) do update
    set status = excluded.status, payload = excluded.payload, fetched_at = excluded.fetched_at;
$$;

revoke all on function public.brreg_cache_get(text, integer) from public, anon, authenticated;
revoke all on function public.brreg_cache_put(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.brreg_cache_get(text, integer) to service_role;
grant execute on function public.brreg_cache_put(text, text, jsonb) to service_role;

-- Starting an application ------------------------------------------------------------------------
-- Called by server code (service role) after the org number passed Brønnøysundregistrene.
-- Creates the business, links it to the user's pending vendor membership (which becomes active:
-- owner decision P05) and opens a draft application for the event. One transaction.
create function public.start_vendor_application(
  p_user_id uuid,
  p_event_id uuid,
  p_org_number text,
  p_legal_name text,
  p_display_name text,
  p_business_form text,
  p_business_address text,
  p_postal_code text,
  p_city text,
  p_brreg_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_membership_id uuid;
  v_vendor_id uuid;
  v_base_slug text;
  v_slug text;
  v_n integer := 1;
  v_event_vendor_id uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Unknown event' using errcode = 'no_data_found';
  end if;

  select m.id into v_membership_id from public.memberships m
   where m.user_id = p_user_id and m.organization_id = v_event.organization_id and m.role = 'vendor'
     and m.vendor_id is null and m.status = 'pending'
   limit 1;
  if not found then
    raise exception 'No vendor sign-up to attach the business to' using errcode = 'no_data_found';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(
    lower(translate(p_display_name, 'æøåéèêäöüÆØÅÉÈÊÄÖÜ', 'aoaeeeaouaoaeeeaou')),
    '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then v_base_slug := 'vendor'; end if;
  v_slug := v_base_slug;
  while exists (select 1 from public.vendors v where v.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base_slug || '-' || v_n;
  end loop;

  insert into public.vendors (
    organization_id, org_number, legal_name, display_name, slug, business_form,
    business_address, postal_code, city, brreg_verified_at, brreg_status
  ) values (
    v_event.organization_id, p_org_number, p_legal_name, p_display_name, v_slug,
    p_business_form, p_business_address, p_postal_code, p_city, now(), p_brreg_status
  ) returning id into v_vendor_id;

  update public.memberships set vendor_id = v_vendor_id, status = 'active'
   where id = v_membership_id;

  insert into public.event_vendors (organization_id, event_id, vendor_id, application_progress)
  values (v_event.organization_id, v_event.id, v_vendor_id, '{"completed": ["business"]}'::jsonb)
  returning id into v_event_vendor_id;

  return v_event_vendor_id;
end;
$$;
revoke all on function public.start_vendor_application(
  uuid, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.start_vendor_application(
  uuid, uuid, text, text, text, text, text, text, text, text
) to service_role;

-- Storage (VEN-03) ------------------------------------------------------------------------------
-- Files live under "{vendor_id}/…". Documents are private (signed URLs); logo and cover images
-- are public profile media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vendor-documents', 'vendor-documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('vendor-media', 'vendor-media', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Vendor whose folder holds the object, or null when the path does not start with one.
create function private.storage_vendor_id(object_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when split_part(object_name, '/', 1)
                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end;
$$;

create function private.can_read_vendor_files(vendor uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select vendor = any (private.my_vendor_ids())
      or private.is_platform_owner()
      or private.staff_can_see_vendor(vendor)
      or exists (
        select 1 from public.vendors v
         where v.id = vendor and private.is_org_staff(v.organization_id)
      );
$$;
revoke all on function private.storage_vendor_id(text) from public;
revoke all on function private.can_read_vendor_files(uuid) from public;
grant execute on function private.storage_vendor_id(text), private.can_read_vendor_files(uuid)
  to authenticated;

create policy vendor_files_select on storage.objects for select to authenticated
  using (
    bucket_id in ('vendor-documents', 'vendor-media')
    and private.can_read_vendor_files(private.storage_vendor_id(name))
  );
create policy vendor_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('vendor-documents', 'vendor-media')
    and private.storage_vendor_id(name) = any ((select private.my_vendor_ids())::uuid[])
  );
create policy vendor_files_update on storage.objects for update to authenticated
  using (
    bucket_id in ('vendor-documents', 'vendor-media')
    and private.storage_vendor_id(name) = any ((select private.my_vendor_ids())::uuid[])
  )
  with check (
    bucket_id in ('vendor-documents', 'vendor-media')
    and private.storage_vendor_id(name) = any ((select private.my_vendor_ids())::uuid[])
  );
create policy vendor_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('vendor-documents', 'vendor-media')
    and private.storage_vendor_id(name) = any ((select private.my_vendor_ids())::uuid[])
  );

-- Vendors edit while the application is a draft or more info is requested (VEN-04); which status
-- changes they may make is decided by private.event_vendor_transition().
drop policy event_vendors_update on public.event_vendors;
create policy event_vendors_update on public.event_vendors for update to authenticated
  using (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[])
     and status in ('draft', 'more_info_requested'))
    or private.is_event_staff(organization_id, event_id)
  )
  with check (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[])
     and status in ('draft', 'more_info_requested', 'submitted') and not is_published)
    or private.is_event_staff(organization_id, event_id)
  );
