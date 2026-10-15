-- Tenancy: organization → event → everything else (PRD §4, decision D9).

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  org_number char(9) check (org_number ~ '^[0-9]{9}$'),
  default_locale text not null default 'nb' check (default_locale in ('nb', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is
  'Tenant. Its own id is the organization_id every other table refers to.';

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status public.event_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  venue_address text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  -- Lets event-scoped tables reference (event_id, organization_id) so a row can never point at
  -- an event in another tenant.
  unique (id, organization_id),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index events_organization_id_idx on public.events (organization_id);

-- Platform Owners operate the whole platform (Lumina Connect). Not tied to one organization.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.platform_admins is
  'Platform-wide role, deliberately without organization_id (PRD §4 Platform Owner).';

-- A user's roles per organization (AUTH-03). Vendor and sponsor memberships name the business
-- they act for; foreign keys are added with the vendors and sponsors tables.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null,
  vendor_id uuid,
  sponsor_id uuid,
  created_at timestamptz not null default now(),
  check ((role = 'vendor') = (vendor_id is not null)),
  check ((role = 'sponsor') = (sponsor_id is not null))
);
create unique index memberships_staff_unique on public.memberships (organization_id, user_id, role)
  where role in ('org_admin', 'event_admin');
create unique index memberships_vendor_unique on public.memberships (user_id, vendor_id)
  where vendor_id is not null;
create unique index memberships_sponsor_unique on public.memberships (user_id, sponsor_id)
  where sponsor_id is not null;
create index memberships_organization_id_idx on public.memberships (organization_id);
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_vendor_id_idx on public.memberships (vendor_id);
create index memberships_sponsor_id_idx on public.memberships (sponsor_id);

-- Events an Event Admin is assigned to (PRD §4: "assigned events").
create table public.event_admins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
create index event_admins_organization_id_idx on public.event_admins (organization_id);
create index event_admins_event_org_idx on public.event_admins (event_id, organization_id);
create index event_admins_user_id_idx on public.event_admins (user_id);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function private.set_updated_at();
