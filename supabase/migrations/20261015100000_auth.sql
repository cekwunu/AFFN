-- P04 authentication and roles (AUTH-01 … AUTH-04).

-- Pending memberships ------------------------------------------------------------------------
-- Vendor and sponsor self sign-up creates a pending membership. It grants no data access; the
-- business (vendor_id / sponsor_id) is linked when the profile is created, and the membership
-- becomes active then. Staff memberships are always active.
create type public.membership_status as enum ('pending', 'active');

alter table public.memberships
  add column status public.membership_status not null default 'active',
  drop constraint memberships_check,
  drop constraint memberships_check1,
  add constraint memberships_status_check
    check (status = 'active' or role in ('vendor', 'sponsor')),
  add constraint memberships_vendor_check
    check (case when role = 'vendor' then status = 'pending' or vendor_id is not null
                else vendor_id is null end),
  add constraint memberships_sponsor_check
    check (case when role = 'sponsor' then status = 'pending' or sponsor_id is not null
                else sponsor_id is null end);
create unique index memberships_pending_unique on public.memberships (organization_id, user_id, role)
  where status = 'pending';

-- Helpers: only active memberships count; admin powers require MFA (aal2) ------------------

-- True when the current session passed multi-factor authentication (AUTH-04).
create function private.has_aal2()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

create or replace function private.is_platform_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_aal2()
     and exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()));
$$;

create or replace function private.org_role(org uuid)
returns public.membership_role
language sql stable security definer
set search_path = ''
as $$
  select m.role
    from public.memberships m
   where m.organization_id = org and m.user_id = (select auth.uid()) and m.status = 'active'
   order by m.role
   limit 1;
$$;

create or replace function private.is_org_admin(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_aal2() and exists (
    select 1 from public.memberships m
     where m.organization_id = org and m.user_id = (select auth.uid())
       and m.role = 'org_admin' and m.status = 'active'
  );
$$;

create or replace function private.is_org_staff(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_org_admin(org) or exists (
    select 1 from public.memberships m
     where m.organization_id = org and m.user_id = (select auth.uid())
       and m.role = 'event_admin' and m.status = 'active'
  );
$$;

create or replace function private.is_event_staff(org uuid, event uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_org_admin(org) or exists (
    select 1
      from public.event_admins ea
      join public.memberships m
        on m.organization_id = ea.organization_id and m.user_id = ea.user_id
       and m.role = 'event_admin' and m.status = 'active'
     where ea.organization_id = org and ea.event_id = event
       and ea.user_id = (select auth.uid())
  );
$$;

create or replace function private.my_vendor_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.vendor_id), '{}')
    from public.memberships m
   where m.user_id = (select auth.uid()) and m.vendor_id is not null and m.status = 'active';
$$;

create or replace function private.my_sponsor_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.sponsor_id), '{}')
    from public.memberships m
   where m.user_id = (select auth.uid()) and m.sponsor_id is not null and m.status = 'active';
$$;

create or replace function private.my_org_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct org), '{}') from (
    select m.organization_id as org
      from public.memberships m
     where m.user_id = (select auth.uid()) and m.status = 'active'
    union
    select ev.organization_id
      from public.event_vendors ev
      join public.memberships m on m.vendor_id = ev.vendor_id and m.status = 'active'
     where m.user_id = (select auth.uid())
  ) orgs;
$$;

revoke all on function private.has_aal2() from public;
grant execute on function private.has_aal2() to anon, authenticated;

-- Invitations (Organization Admin invites Event Admins) ------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_id uuid,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role public.membership_role not null default 'event_admin' check (role = 'event_admin'),
  locale text not null default 'nb' check (locale in ('nb', 'en')),
  -- sha-256 of the token in the link; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users (id) on delete restrict,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
comment on column public.invitations.email is 'PERSONAL DATA';
create unique index invitations_open_unique on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_event_org_idx on public.invitations (event_id, organization_id);
create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_accepted_by_idx on public.invitations (accepted_by);
create index invitations_revoked_by_idx on public.invitations (revoked_by);

alter table public.invitations enable row level security;
grant select, insert on public.invitations to authenticated;
grant update (revoked_at, revoked_by) on public.invitations to authenticated;

create policy invitations_select on public.invitations for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_admin(organization_id));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    private.is_org_admin(organization_id) and invited_by = (select auth.uid())
    and accepted_at is null and revoked_at is null
  );
-- Revoking an open invitation; accepting happens in server code.
create policy invitations_update on public.invitations for update to authenticated
  using (private.is_org_admin(organization_id) and accepted_at is null)
  with check (private.is_org_admin(organization_id) and revoked_by = (select auth.uid()));

create trigger invitations_audit after insert or update on public.invitations
  for each row execute function private.audit_change();

-- Self sign-up: pending vendor/sponsor membership ----------------------------------------
-- Reads the sign-up metadata. Only vendor and sponsor can be requested and only as pending,
-- so a user cannot grant themselves access by editing the metadata.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'signup_role';
  org uuid;
begin
  if requested in ('vendor', 'sponsor') then
    select o.id into org
      from public.organizations o
     where o.slug = new.raw_user_meta_data ->> 'organization_slug';
    if org is not null then
      insert into public.memberships (organization_id, user_id, role, status)
      values (org, new.id, requested::public.membership_role, 'pending')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Access token hook: roles in the JWT for routing ----------------------------------------
-- Adds claim `affn`: { po: platform owner, roles: [{ org, role, status }] }. Used by the proxy
-- to route without a database call. RLS still checks live memberships.
create function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (event ->> 'user_id')::uuid;
  roles jsonb;
begin
  select coalesce(
           jsonb_agg(jsonb_build_object('org', m.organization_id, 'role', m.role, 'status', m.status)
                     order by m.organization_id, m.role),
           '[]'::jsonb)
    into roles
    from public.memberships m
   where m.user_id = uid;

  return jsonb_set(
    event,
    '{claims,affn}',
    jsonb_build_object(
      'po', exists (select 1 from public.platform_admins pa where pa.user_id = uid),
      'roles', roles
    )
  );
end;
$$;
revoke all on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Rate limiting (login, password reset, sign-up) ----------------------------------------------
-- Fixed windows keyed by an HMAC computed in server code: no IP addresses or emails are stored.
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table private.rate_limits enable row level security;

-- Counts a hit and returns whether the caller is still within the limit.
create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end
  returning hits into current_hits;

  -- Occasional clean-up of expired windows.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
  return current_hits <= p_limit;
end;
$$;

-- Returns whether the key is still within the limit, without counting a hit.
create function public.rate_limit_check(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.hits < p_limit
      from private.rate_limits r
     where r.key = p_key and r.window_start > now() - make_interval(secs => p_window_seconds)
  ), true);
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_check(text, integer, integer) to service_role;
