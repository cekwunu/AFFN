-- Access helpers used by RLS policies. They live in `private` (not exposed by the API), are
-- SECURITY DEFINER so they can read memberships without recursing into RLS, and pin
-- search_path. Policies call the argument-free ones as `(select private.fn())` so Postgres
-- evaluates them once per statement, not per row.

-- Tables whose organization_id is the vendor's home organization must agree with the vendor.
alter table public.vendors add constraint vendors_id_organization_key unique (id, organization_id);
alter table public.vendor_contacts
  add constraint vendor_contacts_vendor_org_fkey foreign key (vendor_id, organization_id)
  references public.vendors (id, organization_id);
alter table public.vendor_documents
  add constraint vendor_documents_vendor_org_fkey foreign key (vendor_id, organization_id)
  references public.vendors (id, organization_id);
alter table public.products
  add constraint products_vendor_org_fkey foreign key (vendor_id, organization_id)
  references public.vendors (id, organization_id);
alter table public.leads
  add constraint leads_vendor_org_fkey foreign key (vendor_id, organization_id)
  references public.vendors (id, organization_id);
create index vendor_contacts_vendor_org_idx on public.vendor_contacts (vendor_id, organization_id);
create index vendor_documents_vendor_org_idx on public.vendor_documents (vendor_id, organization_id);
create index products_vendor_org_idx on public.products (vendor_id, organization_id);
create index leads_vendor_org_idx on public.leads (vendor_id, organization_id);
alter table public.sponsors add constraint sponsors_id_organization_key unique (id, organization_id);
alter table public.sponsorships
  add constraint sponsorships_sponsor_org_fkey foreign key (sponsor_id, organization_id)
  references public.sponsors (id, organization_id);
create index sponsorships_sponsor_org_idx on public.sponsorships (sponsor_id, organization_id);

-- Identity --------------------------------------------------------------------------------------

create function private.is_platform_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()));
$$;

-- The current user's highest role in an organization, or null (AUTH-03).
create function private.org_role(org uuid)
returns public.membership_role
language sql stable security definer
set search_path = ''
as $$
  select m.role
    from public.memberships m
   where m.organization_id = org and m.user_id = (select auth.uid())
   order by m.role  -- enum order: org_admin, event_admin, vendor, sponsor
   limit 1;
$$;

create function private.is_org_admin(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = 'org_admin'
  );
$$;

-- Organization Admin or any Event Admin of the organization (reads org-level reference data).
create function private.is_org_staff(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.organization_id = org and m.user_id = (select auth.uid())
       and m.role in ('org_admin', 'event_admin')
  );
$$;

-- Organization Admin, or an Event Admin assigned to this event.
create function private.is_event_staff(org uuid, event uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_org_admin(org) or exists (
    select 1
      from public.event_admins ea
      join public.memberships m
        on m.organization_id = ea.organization_id and m.user_id = ea.user_id
       and m.role = 'event_admin'
     where ea.organization_id = org and ea.event_id = event
       and ea.user_id = (select auth.uid())
  );
$$;

create function private.my_vendor_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.vendor_id), '{}')
    from public.memberships m
   where m.user_id = (select auth.uid()) and m.vendor_id is not null;
$$;

create function private.my_sponsor_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.sponsor_id), '{}')
    from public.memberships m
   where m.user_id = (select auth.uid()) and m.sponsor_id is not null;
$$;

-- Organizations the user belongs to, plus those whose events the user's vendors take part in.
create function private.my_org_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct org), '{}') from (
    select m.organization_id as org
      from public.memberships m
     where m.user_id = (select auth.uid())
    union
    select ev.organization_id
      from public.event_vendors ev
      join public.memberships m on m.vendor_id = ev.vendor_id
     where m.user_id = (select auth.uid())
  ) orgs;
$$;

-- Staff of any organization where the vendor applies or takes part may see the vendor
-- (a vendor's home organization can differ from the event's).
create function private.staff_can_see_vendor(vendor uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_vendors ev
     where ev.vendor_id = vendor and private.is_event_staff(ev.organization_id, ev.event_id)
  );
$$;

create function private.settlement_is_draft(settlement uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.settlements s where s.id = settlement and s.status = 'draft');
$$;

-- Public visibility (visitors without an account) ------------------------------------------------

create function private.event_is_public(event uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e where e.id = event and e.status in ('published', 'closed')
  );
$$;

create function private.org_is_public(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.organization_id = org and e.status in ('published', 'closed')
  );
$$;

create function private.vendor_is_public(vendor uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.vendors v where v.id = vendor and v.profile_published);
$$;

create function private.event_vendor_is_public(event_vendor uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.event_vendors ev
      join public.vendors v on v.id = ev.vendor_id
      join public.events e on e.id = ev.event_id
     where ev.id = event_vendor and ev.status = 'approved' and ev.is_published
       and v.profile_published and e.status in ('published', 'closed')
  );
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.is_platform_owner(), private.org_role(uuid), private.is_org_admin(uuid),
  private.is_org_staff(uuid), private.is_event_staff(uuid, uuid), private.my_vendor_ids(),
  private.my_sponsor_ids(), private.my_org_ids(), private.staff_can_see_vendor(uuid),
  private.settlement_is_draft(uuid), private.event_is_public(uuid), private.org_is_public(uuid),
  private.vendor_is_public(uuid), private.event_vendor_is_public(uuid)
  to anon, authenticated;
