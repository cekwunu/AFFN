-- P16 Sponsor portal and sponsor report (SPO-01 … SPO-04).

-- Packages are fully configurable per event (no fixed tiers): price, deliverables, how prominently
-- the logo is shown (1 = largest) and how many sponsor QR codes come with it.
alter table public.sponsor_packages
  add column logo_level integer not null default 1 check (logo_level between 1 and 5),
  add column qr_code_count integer not null default 1 check (qr_code_count between 0 and 20);
create trigger sponsor_packages_audit after insert or update on public.sponsor_packages
  for each row execute function private.audit_change();

-- The registered business (Brønnøysund check at registration).
alter table public.sponsors
  add column legal_name text,
  add column brreg_verified_at timestamptz;

-- Mva on sponsor invoices (AFFN's own revenue): a rate per event, 25 % by default (owner decision
-- P16), changed by Organization Admins on /admin/settings and audited.
alter table public.events
  add column sponsor_mva_bp integer not null default 2500 check (sponsor_mva_bp between 0 and 10000);
create trigger events_sponsor_mva_audit after update on public.events
  for each row execute function private.audit_change('sponsor_mva_bp');

-- Review of an asset: feedback to the sponsor, and what was uploaded.
alter table public.sponsor_assets
  add column feedback text check (length(feedback) <= 1000),
  add column mime_type text,
  add column byte_size bigint check (byte_size > 0);

-- Sponsor page views (SPO-04) are counted per sponsor, without personal data.
alter table public.page_views add column sponsor_id uuid references public.sponsors (id) on delete cascade;
create index page_views_sponsor_id_idx on public.page_views (sponsor_id);

-- Deliverables of a confirmed sponsorship, copied from the package, with their status.
create type public.deliverable_status as enum ('pending', 'in_progress', 'delivered');

create table public.sponsorship_deliverables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  sponsorship_id uuid not null,
  sponsor_id uuid not null,
  position integer not null,
  title text not null check (length(trim(title)) > 0),
  status public.deliverable_status not null default 'pending',
  note text check (length(note) <= 1000),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sponsorship_id, position),
  check ((status = 'delivered') = (delivered_at is not null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (sponsorship_id, organization_id)
    references public.sponsorships (id, organization_id) on delete cascade,
  foreign key (sponsorship_id, sponsor_id) references public.sponsorships (id, sponsor_id)
);
create index sponsorship_deliverables_organization_id_idx on public.sponsorship_deliverables (organization_id);
create index sponsorship_deliverables_event_org_idx on public.sponsorship_deliverables (event_id, organization_id);
create index sponsorship_deliverables_sponsorship_sponsor_idx on public.sponsorship_deliverables (sponsorship_id, sponsor_id);
create trigger sponsorship_deliverables_updated_at before update on public.sponsorship_deliverables
  for each row execute function private.set_updated_at();
create trigger sponsorship_deliverables_audit after update on public.sponsorship_deliverables
  for each row execute function private.audit_change('status');

-- Delivered time follows the status.
create function private.stamp_deliverable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.delivered_at := case when new.status = 'delivered' then coalesce(old.delivered_at, now()) end;
  return new;
end;
$$;
revoke all on function private.stamp_deliverable() from public;
create trigger sponsorship_deliverables_stamp before update of status on public.sponsorship_deliverables
  for each row execute function private.stamp_deliverable();

alter table public.sponsorship_deliverables enable row level security;
grant select on public.sponsorship_deliverables to authenticated;
grant update (status, note) on public.sponsorship_deliverables to authenticated;
create policy sponsorship_deliverables_select on public.sponsorship_deliverables for select to authenticated
  using (
    (select private.is_platform_owner())
    or sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy sponsorship_deliverables_update on public.sponsorship_deliverables for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));

-- Sponsor invoices (AFFN revenue, bank transfer). Numbered from the same gapless series as every
-- other AFFN invoice (invoice_counters via private.assign_invoice_number).
create table public.sponsor_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  sponsorship_id uuid not null,
  sponsor_id uuid not null references public.sponsors (id) on delete restrict,
  invoice_number bigint not null default 0,
  description text not null,
  subtotal_ore bigint not null check (subtotal_ore >= 0),
  mva_ore bigint not null check (mva_ore >= 0),
  total_ore bigint not null,
  mva_rate_bp integer not null check (mva_rate_bp between 0 and 10000),
  status public.invoice_status not null default 'issued',
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  paid_at timestamptz,
  paid_marked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  unique (sponsorship_id),
  check (total_ore = subtotal_ore + mva_ore),
  check ((status = 'paid') = (paid_at is not null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (sponsorship_id, organization_id)
    references public.sponsorships (id, organization_id) on delete restrict,
  foreign key (sponsorship_id, sponsor_id) references public.sponsorships (id, sponsor_id)
);
create index sponsor_invoices_event_org_idx on public.sponsor_invoices (event_id, organization_id);
create index sponsor_invoices_sponsorship_sponsor_idx on public.sponsor_invoices (sponsorship_id, sponsor_id);
create index sponsor_invoices_paid_marked_by_idx on public.sponsor_invoices (paid_marked_by);
create index sponsor_invoices_sponsor_id_idx on public.sponsor_invoices (sponsor_id);
create trigger sponsor_invoices_assign_number before insert on public.sponsor_invoices
  for each row execute function private.assign_invoice_number();
create trigger sponsor_invoices_updated_at before update on public.sponsor_invoices
  for each row execute function private.set_updated_at();
create trigger sponsor_invoices_audit after insert or update on public.sponsor_invoices
  for each row execute function private.audit_change('status');

alter table public.sponsor_invoices enable row level security;
grant select on public.sponsor_invoices to authenticated;
create policy sponsor_invoices_select on public.sponsor_invoices for select to authenticated
  using (
    (select private.is_platform_owner())
    or sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

-- Documents for sponsors: their invoice and the post-event report (PDF + CSV).
alter type public.document_kind add value if not exists 'sponsor_invoice';
alter type public.document_kind add value if not exists 'sponsor_report_pdf';
alter type public.document_kind add value if not exists 'sponsor_report_csv';
alter table public.documents
  add column sponsor_id uuid references public.sponsors (id) on delete restrict,
  add column sponsorship_id uuid;
create index documents_sponsor_id_idx on public.documents (sponsor_id);
alter policy documents_select on public.documents
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
    or (event_id is not null and private.is_event_staff(organization_id, event_id))
    or (event_id is null and private.is_org_staff(organization_id))
  );

-- Sponsor files: uploads in a private bucket under {sponsor_id}/ (logos SVG/PNG, banners, video
-- up to 50 MB); approved logos are copied by the server to the public bucket for the website.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('sponsor-assets', 'sponsor-assets', false, 52428800,
   array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
         'video/mp4', 'video/webm', 'video/quicktime']),
  ('sponsor-media', 'sponsor-media', true, 5242880,
   array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create function private.can_read_sponsor_files(sponsor uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select sponsor = any (private.my_sponsor_ids())
      or private.is_platform_owner()
      or exists (
        select 1 from public.sponsors s
         where s.id = sponsor and private.is_org_staff(s.organization_id)
      );
$$;
revoke all on function private.can_read_sponsor_files(uuid) from public;
grant execute on function private.can_read_sponsor_files(uuid) to authenticated;

create policy sponsor_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sponsor-assets'
    and private.can_read_sponsor_files(private.storage_vendor_id(name))
  );
create policy sponsor_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sponsor-assets'
    and private.storage_vendor_id(name) = any ((select private.my_sponsor_ids())::uuid[])
  );

-- Registration (SPO-01), server code after the Brønnøysund check: the business, the pending
-- membership made active, and an inquiry for the chosen package.
create function public.register_sponsor(
  p_user_id uuid,
  p_package_id uuid,
  p_org_number text,
  p_legal_name text,
  p_name text,
  p_website_url text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_invoice_email text,
  p_invoice_address text,
  p_invoice_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_package public.sponsor_packages;
  v_membership_id uuid;
  v_sponsor_id uuid;
  v_sponsorship_id uuid;
begin
  select * into v_package from public.sponsor_packages where id = p_package_id and is_active;
  if not found then
    raise exception 'Unknown package' using errcode = 'no_data_found';
  end if;
  select m.id into v_membership_id from public.memberships m
   where m.user_id = p_user_id and m.organization_id = v_package.organization_id
     and m.role = 'sponsor' and m.sponsor_id is null and m.status = 'pending'
   limit 1;
  if not found then
    raise exception 'No sponsor sign-up to attach the business to' using errcode = 'no_data_found';
  end if;

  insert into public.sponsors (
    organization_id, name, legal_name, org_number, website_url, contact_name, contact_email,
    contact_phone, invoice_email, invoice_address, invoice_reference, brreg_verified_at
  ) values (
    v_package.organization_id, p_name, p_legal_name, p_org_number, nullif(p_website_url, ''),
    p_contact_name, p_contact_email, nullif(p_contact_phone, ''), p_invoice_email,
    nullif(p_invoice_address, ''), nullif(p_invoice_reference, ''), now()
  ) returning id into v_sponsor_id;

  update public.memberships set sponsor_id = v_sponsor_id, status = 'active'
   where id = v_membership_id;

  insert into public.sponsorships (organization_id, event_id, sponsor_id, package_id, status)
  values (v_package.organization_id, v_package.event_id, v_sponsor_id, v_package.id, 'inquiry')
  returning id into v_sponsorship_id;
  return v_sponsorship_id;
end;
$$;
revoke all on function public.register_sponsor(uuid, uuid, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_sponsor(uuid, uuid, text, text, text, text, text, text, text, text, text, text)
  to service_role;

-- Approval (SPO-01): event staff confirm an inquiry (price defaults to the package's), which
-- creates the deliverables, the sponsor's QR codes and tracked link, and the invoice (event mva,
-- due after the organization's payment terms). Or they decline it. Audited with the note.
create function private.review_sponsorship(
  p_sponsorship_id uuid,
  p_approve boolean,
  p_note text,
  p_price_ore bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sponsorship public.sponsorships;
  v_package public.sponsor_packages;
  v_sponsor public.sponsors;
  v_event public.events;
  v_price bigint;
  v_mva bigint;
  v_due_days integer;
  v_invoice_id uuid;
  v_i integer;
begin
  select * into v_sponsorship from public.sponsorships where id = p_sponsorship_id for update;
  if not found or (
    auth.uid() is not null
    and not private.is_event_staff(v_sponsorship.organization_id, v_sponsorship.event_id)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sponsorship.status <> 'inquiry' then
    raise exception 'not_inquiry' using errcode = 'check_violation';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A note is required' using errcode = 'check_violation';
  end if;
  perform set_config('affn.audit_reason', trim(p_note), true);

  if not p_approve then
    update public.sponsorships set status = 'cancelled', notes = trim(p_note) where id = v_sponsorship.id;
    perform set_config('affn.audit_reason', '', true);
    return null;
  end if;

  select * into v_package from public.sponsor_packages where id = v_sponsorship.package_id;
  select * into v_sponsor from public.sponsors where id = v_sponsorship.sponsor_id;
  select * into v_event from public.events where id = v_sponsorship.event_id;
  select invoice_due_days into v_due_days from public.organizations where id = v_sponsorship.organization_id;
  v_price := coalesce(p_price_ore, v_package.price_ore);
  if v_price < 0 then
    raise exception 'price' using errcode = 'check_violation';
  end if;
  v_mva := (v_price * v_event.sponsor_mva_bp * 2 + 10000) / 20000;

  update public.sponsorships
     set status = 'invoiced', agreed_price_ore = v_price, notes = trim(p_note)
   where id = v_sponsorship.id;

  insert into public.sponsorship_deliverables (
    organization_id, event_id, sponsorship_id, sponsor_id, position, title
  )
  select v_sponsorship.organization_id, v_sponsorship.event_id, v_sponsorship.id,
         v_sponsorship.sponsor_id, d.position, d.title
    from unnest(v_package.deliverables) with ordinality as d (title, position);

  -- QR codes for print, and one tracked link for the website and campaigns (SPO-03).
  for v_i in 1 .. v_package.qr_code_count loop
    insert into public.tracked_links (
      organization_id, event_id, kind, slug, target_url, label, sponsorship_id, sponsor_id
    ) values (
      v_sponsorship.organization_id, v_sponsorship.event_id, 'qr',
      substr(md5(gen_random_uuid()::text), 1, 10),
      coalesce(v_sponsor.website_url, '/'), 'QR ' || v_i, v_sponsorship.id, v_sponsorship.sponsor_id
    );
  end loop;
  insert into public.tracked_links (
    organization_id, event_id, kind, slug, target_url, label, sponsorship_id, sponsor_id
  ) values (
    v_sponsorship.organization_id, v_sponsorship.event_id, 'link',
    substr(md5(gen_random_uuid()::text), 1, 10),
    coalesce(v_sponsor.website_url, '/'), 'Link', v_sponsorship.id, v_sponsorship.sponsor_id
  );

  insert into public.sponsor_invoices (
    organization_id, event_id, sponsorship_id, sponsor_id, description, subtotal_ore, mva_ore,
    total_ore, mva_rate_bp, due_at
  ) values (
    v_sponsorship.organization_id, v_sponsorship.event_id, v_sponsorship.id,
    v_sponsorship.sponsor_id, v_package.name, v_price, v_mva, v_price + v_mva,
    v_event.sponsor_mva_bp, now() + make_interval(days => coalesce(v_due_days, 14))
  ) returning id into v_invoice_id;
  perform set_config('affn.audit_reason', '', true);
  return v_invoice_id;
end;
$$;
revoke all on function private.review_sponsorship(uuid, boolean, text, bigint) from public, anon;
grant execute on function private.review_sponsorship(uuid, boolean, text, bigint) to authenticated, service_role;

create function public.review_sponsorship(
  p_sponsorship_id uuid,
  p_approve boolean,
  p_note text,
  p_price_ore bigint default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.review_sponsorship(p_sponsorship_id, p_approve, p_note, p_price_ore);
$$;
revoke all on function public.review_sponsorship(uuid, boolean, text, bigint) from public, anon;
grant execute on function public.review_sponsorship(uuid, boolean, text, bigint) to authenticated, service_role;

-- Bank transfer received: an Organization Admin marks the invoice paid (audited).
create function private.mark_sponsor_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.sponsor_invoices;
begin
  select * into v_invoice from public.sponsor_invoices where id = p_invoice_id for update;
  if not found or (auth.uid() is not null and not private.is_org_admin(v_invoice.organization_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'not_open' using errcode = 'check_violation';
  end if;
  update public.sponsor_invoices
     set status = 'paid', paid_at = now(), paid_marked_by = auth.uid()
   where id = v_invoice.id;
  update public.sponsorships set status = 'paid' where id = v_invoice.sponsorship_id;
end;
$$;
revoke all on function private.mark_sponsor_invoice_paid(uuid) from public, anon;
grant execute on function private.mark_sponsor_invoice_paid(uuid) to authenticated, service_role;

create function public.mark_sponsor_invoice_paid(p_invoice_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_sponsor_invoice_paid(p_invoice_id);
$$;
revoke all on function public.mark_sponsor_invoice_paid(uuid) from public, anon;
grant execute on function public.mark_sponsor_invoice_paid(uuid) to authenticated, service_role;

-- A scan or click on /s/[code] (SPO-03): counted with the time and a coarse device type only —
-- no IP address, no cookies. Returns where to send the visitor. Server code only.
create function public.record_link_hit(p_slug text, p_device_class text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.tracked_links;
begin
  select * into v_link from public.tracked_links where slug = p_slug;
  if not found then
    return null;
  end if;
  insert into public.qr_scans (organization_id, event_id, tracked_link_id, device_class)
  values (
    v_link.organization_id, v_link.event_id, v_link.id,
    case when p_device_class in ('mobile', 'tablet', 'desktop') then p_device_class else 'other' end
  );
  return v_link.target_url;
end;
$$;
revoke all on function public.record_link_hit(text, text) from public, anon, authenticated;
grant execute on function public.record_link_hit(text, text) to service_role;
