-- Platform tables (SYS-*): audit log, notifications, payment-provider webhooks.

-- Append-only record of approvals, money events, role and rate changes (SYS-01, NFR-11).
-- organization_id is null only for platform-level actions (e.g. platform_admins changes).
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  event_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null default current_user,
  table_name text not null,
  row_id text,
  action public.audit_action not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict
);
create index audit_log_organization_created_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_event_org_idx on public.audit_log (event_id, organization_id);
create index audit_log_actor_id_idx on public.audit_log (actor_id);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_organization_id_idx on public.notifications (organization_id);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc);

-- Raw webhook events exactly as received (NFR-04). Append-only: the outcome of each
-- processing attempt is a new row in psp_webhook_attempts, which keeps retries replay-safe.
create table public.psp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  provider public.payment_provider not null,
  provider_event_id text not null,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
comment on column public.psp_webhook_events.organization_id is
  'Null until the event is matched to a payment of an organization.';
create index psp_webhook_events_organization_id_idx on public.psp_webhook_events (organization_id);

create table public.psp_webhook_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete restrict,
  webhook_event_id uuid not null references public.psp_webhook_events (id) on delete restrict,
  outcome public.webhook_outcome not null,
  error text,
  attempted_at timestamptz not null default now(),
  check ((outcome = 'failed') = (error is not null))
);
create index psp_webhook_attempts_organization_id_idx on public.psp_webhook_attempts (organization_id);
create index psp_webhook_attempts_event_idx on public.psp_webhook_attempts (webhook_event_id, attempted_at desc);
