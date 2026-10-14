-- Vendors and applications (VEN-*, REV-*). A vendor is a business with a home organization
-- (owner decision); it takes part in events of any organization through event_vendors.

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Business data (public registry information, safe to publish).
  org_number char(9) not null unique check (org_number ~ '^[0-9]{9}$'),
  legal_name text not null check (length(trim(legal_name)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_form text check (business_form in ('ENK', 'AS', 'NUF', 'ANS', 'DA', 'SA', 'other')),
  brreg_verified_at timestamptz,
  brreg_status text,
  mva_registered boolean not null default false,
  -- Public profile (VIS-02).
  category text,
  cuisine_country char(2) check (cuisine_country ~ '^[A-Z]{2}$'),
  description text,
  story text,
  logo_path text,
  cover_image_path text,
  public_email text,
  public_phone text,
  website_url text,
  instagram_handle text,
  facebook_url text,
  tiktok_handle text,
  offers_catering boolean not null default false,
  profile_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendors_organization_id_idx on public.vendors (organization_id);
comment on column public.vendors.public_email is 'Business contact shown on the public profile.';

-- Personal contact details, kept apart from the publishable vendor profile (GDPR export/erasure).
create table public.vendor_contacts (
  vendor_id uuid primary key references public.vendors (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendor_contacts_organization_id_idx on public.vendor_contacts (organization_id);
comment on column public.vendor_contacts.contact_name is 'PERSONAL DATA';
comment on column public.vendor_contacts.contact_email is 'PERSONAL DATA';
comment on column public.vendor_contacts.contact_phone is 'PERSONAL DATA';

alter table public.memberships
  add constraint memberships_vendor_id_fkey foreign key (vendor_id)
  references public.vendors (id) on delete cascade;

create table public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  document_type public.document_type not null,
  storage_path text not null,
  file_name text not null,
  expires_on date,
  status public.review_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendor_documents_organization_id_idx on public.vendor_documents (organization_id);
create index vendor_documents_vendor_id_idx on public.vendor_documents (vendor_id);
create index vendor_documents_reviewed_by_idx on public.vendor_documents (reviewed_by);
create index vendor_documents_uploaded_by_idx on public.vendor_documents (uploaded_by);

-- A vendor's participation in one event: application, stall needs, payment-provider account.
create table public.event_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  status public.application_status not null default 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  needs_power boolean not null default false,
  needs_water boolean not null default false,
  requested_stall_size text,
  application_notes text,
  psp_account_id text,
  psp_account_status public.psp_account_status not null default 'not_started',
  qr_slug text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_published boolean not null default false,
  is_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, vendor_id),
  unique (id, organization_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  check (not is_published or status = 'approved')
);
create index event_vendors_organization_id_idx on public.event_vendors (organization_id);
create index event_vendors_event_org_idx on public.event_vendors (event_id, organization_id);
create index event_vendors_vendor_id_idx on public.event_vendors (vendor_id);

-- Timestamped acceptance of the vendor agreement (VEN-05). Immutable once given.
create table public.vendor_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  terms_version text not null,
  commission_terms text not null,
  stall_fee_terms text not null,
  settlement_terms text not null,
  accepted_by uuid not null references auth.users (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete restrict
);
create index vendor_agreements_organization_id_idx on public.vendor_agreements (organization_id);
create index vendor_agreements_event_org_idx on public.vendor_agreements (event_id, organization_id);
create index vendor_agreements_event_vendor_idx on public.vendor_agreements (event_vendor_id, organization_id);
create index vendor_agreements_vendor_id_idx on public.vendor_agreements (vendor_id);
create index vendor_agreements_accepted_by_idx on public.vendor_agreements (accepted_by);

-- One row per status change, with actor and note (REV-02, REV-03).
create table public.application_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  from_status public.application_status,
  to_status public.application_status not null,
  note text not null check (length(trim(note)) > 0),
  actor_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete restrict
);
create index application_reviews_organization_id_idx on public.application_reviews (organization_id);
create index application_reviews_event_org_idx on public.application_reviews (event_id, organization_id);
create index application_reviews_event_vendor_idx on public.application_reviews (event_vendor_id, organization_id);
create index application_reviews_vendor_id_idx on public.application_reviews (vendor_id);
create index application_reviews_actor_id_idx on public.application_reviews (actor_id);

-- Admin-only notes on an application (REV-03). Never visible to vendors.
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  event_vendor_id uuid not null,
  body text not null check (length(trim(body)) > 0),
  author_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete cascade
);
create index internal_notes_organization_id_idx on public.internal_notes (organization_id);
create index internal_notes_event_org_idx on public.internal_notes (event_id, organization_id);
create index internal_notes_event_vendor_idx on public.internal_notes (event_vendor_id, organization_id);
create index internal_notes_author_id_idx on public.internal_notes (author_id);

create trigger vendors_updated_at before update on public.vendors
  for each row execute function private.set_updated_at();
create trigger vendor_contacts_updated_at before update on public.vendor_contacts
  for each row execute function private.set_updated_at();
create trigger vendor_documents_updated_at before update on public.vendor_documents
  for each row execute function private.set_updated_at();
create trigger event_vendors_updated_at before update on public.event_vendors
  for each row execute function private.set_updated_at();
