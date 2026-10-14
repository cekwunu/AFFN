-- Stalls (STL-*) and catalogue (CAT-*).

alter table public.event_vendors add constraint event_vendors_id_vendor_key unique (id, vendor_id);

create table public.stalls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  number text not null check (length(trim(number)) > 0),
  zone text,
  size_label text,
  width_cm integer check (width_cm > 0),
  depth_cm integer check (depth_cm > 0),
  has_power boolean not null default false,
  has_water boolean not null default false,
  is_premium boolean not null default false,
  fee_ore bigint not null default 0 check (fee_ore >= 0),
  -- Pin position on the venue image, in basis points of width/height (0–10000).
  map_x smallint check (map_x between 0 and 10000),
  map_y smallint check (map_y between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, number),
  unique (id, organization_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
create index stalls_organization_id_idx on public.stalls (organization_id);
create index stalls_event_org_idx on public.stalls (event_id, organization_id);

create table public.stall_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  stall_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  status public.assignment_status not null default 'active',
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (stall_id, organization_id) references public.stalls (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete restrict,
  foreign key (event_vendor_id, vendor_id) references public.event_vendors (id, vendor_id),
  check ((status = 'released') = (released_at is not null))
);
-- One active assignment per stall (per event, as a stall belongs to one event), and one
-- active stall per vendor participation.
create unique index stall_assignments_one_active_per_stall
  on public.stall_assignments (stall_id) where status = 'active';
create unique index stall_assignments_one_active_per_vendor
  on public.stall_assignments (event_vendor_id) where status = 'active';
create index stall_assignments_organization_id_idx on public.stall_assignments (organization_id);
create index stall_assignments_event_org_idx on public.stall_assignments (event_id, organization_id);
create index stall_assignments_stall_org_idx on public.stall_assignments (stall_id, organization_id);
create index stall_assignments_event_vendor_org_idx on public.stall_assignments (event_vendor_id, organization_id);
create index stall_assignments_event_vendor_vendor_idx on public.stall_assignments (event_vendor_id, vendor_id);
create index stall_assignments_vendor_id_idx on public.stall_assignments (vendor_id);
create index stall_assignments_assigned_by_idx on public.stall_assignments (assigned_by);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_nb text not null,
  name_en text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);
create index product_categories_organization_id_idx on public.product_categories (organization_id);

-- Products belong to the vendor (organization_id = the vendor's home organization).
-- Never deleted: archived_at hides them while orders keep referring to them (CAT-03).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  category_id uuid,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_ore bigint not null check (price_ore >= 0),
  mva_rate_bp integer not null default 0 check (mva_rate_bp between 0 and 2500),
  image_path text,
  dietary_tags public.dietary_tag[] not null default '{}',
  allergens public.allergen[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, vendor_id),
  foreign key (category_id, organization_id)
    references public.product_categories (id, organization_id) on delete restrict
);
create index products_organization_id_idx on public.products (organization_id);
create index products_vendor_id_idx on public.products (vendor_id);
create index products_category_org_idx on public.products (category_id, organization_id);

-- What a vendor sells at a given event, and whether it is sold out right now (CAT-02).
create table public.product_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  event_vendor_id uuid not null,
  vendor_id uuid not null,
  product_id uuid not null,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (event_id, product_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (event_vendor_id, organization_id)
    references public.event_vendors (id, organization_id) on delete cascade,
  foreign key (event_vendor_id, vendor_id) references public.event_vendors (id, vendor_id),
  foreign key (product_id, vendor_id) references public.products (id, vendor_id)
    on delete restrict
);
create index product_availability_organization_id_idx on public.product_availability (organization_id);
create index product_availability_event_org_idx on public.product_availability (event_id, organization_id);
create index product_availability_event_vendor_org_idx on public.product_availability (event_vendor_id, organization_id);
create index product_availability_event_vendor_vendor_idx on public.product_availability (event_vendor_id, vendor_id);
create index product_availability_product_vendor_idx on public.product_availability (product_id, vendor_id);

create trigger stalls_updated_at before update on public.stalls
  for each row execute function private.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger product_availability_updated_at before update on public.product_availability
  for each row execute function private.set_updated_at();
