-- Sponsors (SPO-*) and engagement (VIS-03, SPO-03/04, OPS-*).

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  org_number char(9) check (org_number ~ '^[0-9]{9}$'),
  website_url text,
  logo_path text,
  contact_name text,
  contact_email text,
  contact_phone text,
  invoice_email text,
  invoice_address text,
  invoice_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.sponsors.contact_name is 'PERSONAL DATA';
comment on column public.sponsors.contact_email is 'PERSONAL DATA';
comment on column public.sponsors.contact_phone is 'PERSONAL DATA';
comment on column public.sponsors.invoice_reference is 'PERSONAL DATA (often a named person)';
create index sponsors_organization_id_idx on public.sponsors (organization_id);

alter table public.memberships
  add constraint memberships_sponsor_id_fkey foreign key (sponsor_id)
  references public.sponsors (id) on delete cascade;

create table public.sponsor_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  tier integer not null default 1 check (tier >= 1),
  price_ore bigint not null check (price_ore >= 0),
  description text,
  deliverables text[] not null default '{}',
  max_sponsors integer check (max_sponsors > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name),
  unique (id, organization_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
create index sponsor_packages_organization_id_idx on public.sponsor_packages (organization_id);
create index sponsor_packages_event_org_idx on public.sponsor_packages (event_id, organization_id);

create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  sponsor_id uuid not null references public.sponsors (id) on delete restrict,
  package_id uuid not null,
  status public.sponsorship_status not null default 'inquiry',
  agreed_price_ore bigint check (agreed_price_ore >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, sponsor_id),
  unique (id, organization_id),
  unique (id, sponsor_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (package_id, organization_id)
    references public.sponsor_packages (id, organization_id) on delete restrict
);
create index sponsorships_organization_id_idx on public.sponsorships (organization_id);
create index sponsorships_event_org_idx on public.sponsorships (event_id, organization_id);
create index sponsorships_sponsor_id_idx on public.sponsorships (sponsor_id);
create index sponsorships_package_org_idx on public.sponsorships (package_id, organization_id);

create table public.sponsor_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  sponsorship_id uuid not null,
  sponsor_id uuid not null,
  kind public.asset_kind not null,
  storage_path text not null,
  file_name text not null,
  status public.review_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (sponsorship_id, organization_id)
    references public.sponsorships (id, organization_id) on delete cascade,
  foreign key (sponsorship_id, sponsor_id) references public.sponsorships (id, sponsor_id)
);
create index sponsor_assets_organization_id_idx on public.sponsor_assets (organization_id);
create index sponsor_assets_event_org_idx on public.sponsor_assets (event_id, organization_id);
create index sponsor_assets_sponsorship_org_idx on public.sponsor_assets (sponsorship_id, organization_id);
create index sponsor_assets_sponsorship_sponsor_idx on public.sponsor_assets (sponsorship_id, sponsor_id);
create index sponsor_assets_reviewed_by_idx on public.sponsor_assets (reviewed_by);
create index sponsor_assets_uploaded_by_idx on public.sponsor_assets (uploaded_by);

-- Sponsor QR codes and tracked links (SPO-03), and vendor QR codes (QR-01).
create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  kind public.link_kind not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{4,64}$'),
  target_url text not null,
  label text,
  sponsorship_id uuid,
  sponsor_id uuid references public.sponsors (id) on delete restrict,
  event_vendor_id uuid,
  vendor_id uuid references public.vendors (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check ((sponsorship_id is null) = (sponsor_id is null)),
  check ((event_vendor_id is null) = (vendor_id is null)),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (sponsorship_id, organization_id)
    references public.sponsorships (id, organization_id) on delete cascade,
  foreign key (sponsorship_id, sponsor_id) references public.sponsorships (id, sponsor_id),
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete cascade,
  foreign key (event_vendor_id, vendor_id) references public.event_vendors (id, vendor_id)
);
create index tracked_links_organization_id_idx on public.tracked_links (organization_id);
create index tracked_links_event_org_idx on public.tracked_links (event_id, organization_id);
create index tracked_links_sponsorship_org_idx on public.tracked_links (sponsorship_id, organization_id);
create index tracked_links_sponsorship_sponsor_idx on public.tracked_links (sponsorship_id, sponsor_id);
create index tracked_links_sponsor_id_idx on public.tracked_links (sponsor_id);
create index tracked_links_event_vendor_org_idx on public.tracked_links (event_vendor_id, organization_id);
create index tracked_links_event_vendor_vendor_idx on public.tracked_links (event_vendor_id, vendor_id);
create index tracked_links_vendor_id_idx on public.tracked_links (vendor_id);

-- Scans and page views carry no IP address or other personal data (PRD §8).
create table public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  tracked_link_id uuid not null,
  scanned_at timestamptz not null default now(),
  device_class text check (device_class in ('mobile', 'tablet', 'desktop', 'other')),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (tracked_link_id, organization_id)
    references public.tracked_links (id, organization_id) on delete cascade
);
create index qr_scans_organization_id_idx on public.qr_scans (organization_id);
create index qr_scans_event_org_idx on public.qr_scans (event_id, organization_id);
create index qr_scans_tracked_link_org_idx on public.qr_scans (tracked_link_id, organization_id);

create table public.page_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_id uuid,
  vendor_id uuid references public.vendors (id) on delete cascade,
  path text not null,
  viewed_at timestamptz not null default now(),
  device_class text check (device_class in ('mobile', 'tablet', 'desktop', 'other')),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
create index page_views_organization_id_idx on public.page_views (organization_id);
create index page_views_event_org_idx on public.page_views (event_id, organization_id);
create index page_views_vendor_id_idx on public.page_views (vendor_id);

-- Contact, catering and quote requests to a vendor (VIS-03). organization_id is the vendor's
-- home organization, as leads also arrive outside events.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_id uuid,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  kind public.lead_kind not null,
  status public.lead_status not null default 'new',
  name text not null,
  email text not null,
  phone text,
  message text not null,
  event_date date,
  guest_count integer check (guest_count > 0),
  consent_text_version text not null,
  consented_at timestamptz not null default now(),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
comment on column public.leads.name is 'PERSONAL DATA';
comment on column public.leads.email is 'PERSONAL DATA';
comment on column public.leads.phone is 'PERSONAL DATA';
comment on column public.leads.message is 'PERSONAL DATA';
create index leads_organization_id_idx on public.leads (organization_id);
create index leads_event_org_idx on public.leads (event_id, organization_id);
create index leads_vendor_status_idx on public.leads (vendor_id, status);

create trigger sponsors_updated_at before update on public.sponsors
  for each row execute function private.set_updated_at();
create trigger sponsor_packages_updated_at before update on public.sponsor_packages
  for each row execute function private.set_updated_at();
create trigger sponsorships_updated_at before update on public.sponsorships
  for each row execute function private.set_updated_at();
create trigger sponsor_assets_updated_at before update on public.sponsor_assets
  for each row execute function private.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
