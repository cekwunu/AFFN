-- P15 Statements, invoices and receipts (SET-04, PRD §6 "AFFN documents", QR-05).

-- AFFN's own details for its invoices (seller): filled in by an Organization Admin on
-- /admin/settings. Documents refuse to generate while the legal name or org number is missing.
alter table public.organizations
  add column legal_name text,
  add column address_line text,
  add column postal_code text check (postal_code ~ '^[0-9]{4}$'),
  add column city text,
  add column vat_registered boolean not null default true,
  add column bank_account text check (bank_account ~ '^[0-9]{11}$'),
  add column invoice_email text,
  add column invoice_due_days integer not null default 14 check (invoice_due_days between 0 and 90);

-- Changes to the organization's details are audited (its own id is the organization).
create function private.audit_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  insert into public.audit_log (
    organization_id, actor_id, actor_role, table_name, row_id, action, old_data, new_data
  ) values (
    new.id, auth.uid(), coalesce(claims ->> 'role', session_user), 'organizations', new.id::text,
    'update', to_jsonb(old), to_jsonb(new)
  );
  return null;
end;
$$;
revoke all on function private.audit_organization() from public;
create trigger organizations_audit after update on public.organizations
  for each row execute function private.audit_organization();

-- Mva on stall fees is an open item (PRD §12): a rate per event, 25 % until the accountant
-- confirms. Changed by Organization Admins (events RLS), audited.
alter table public.events
  add column stall_fee_mva_bp integer not null default 2500 check (stall_fee_mva_bp between 0 and 10000);
create trigger events_stall_fee_mva_audit after update on public.events
  for each row execute function private.audit_change('stall_fee_mva_bp');

-- Invoice lines as printed (description, amount, mva) and the period a commission invoice covers.
alter table public.invoices
  add column description text,
  add column period_from timestamptz,
  add column period_to timestamptz,
  add column lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  -- The mva rate charged (mva itself is rounded per order line, so it cannot be derived).
  add column mva_rate_bp integer check (mva_rate_bp between 0 and 10000);
-- One commission invoice per vendor per settlement.
create unique index invoices_commission_once_idx on public.invoices (settlement_id, vendor_id)
  where kind = 'commission';

-- Approval creates the stall fee with the event's mva rate (was a fixed 25 %).
create or replace function private.review_application(
  p_event_vendor_id uuid,
  p_decision public.application_status,
  p_note text,
  p_commission_rate_bp integer default null,
  p_commission_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_ev public.event_vendors;
  v_fee bigint;
  v_mva_bp integer;
  v_mva bigint;
  v_stall_fee_id uuid;
  v_invoice_id uuid;
  v_invoice_number bigint;
  v_rule_id uuid;
begin
  select * into v_ev from public.event_vendors where id = p_event_vendor_id for update;
  if v_actor is null or not found
     or not private.is_event_staff(v_ev.organization_id, v_ev.event_id) then
    raise exception 'Only event staff can review applications'
      using errcode = 'insufficient_privilege';
  end if;

  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'A note is required' using errcode = 'check_violation';
  end if;

  if not (
    (p_decision = 'under_review' and v_ev.status = 'submitted')
    or (p_decision in ('approved', 'rejected', 'waitlisted', 'more_info_requested')
        and v_ev.status in ('submitted', 'under_review', 'waitlisted')
        and p_decision <> v_ev.status)
  ) then
    raise exception 'An application in status % cannot be moved to %', v_ev.status, p_decision
      using errcode = 'check_violation';
  end if;

  if p_commission_rate_bp is not null then
    if p_decision <> 'approved' then
      raise exception 'A commission rate is set on approval' using errcode = 'check_violation';
    end if;
    if not private.is_org_admin(v_ev.organization_id) then
      raise exception 'Only an Organization Admin can change commission'
        using errcode = 'insufficient_privilege';
    end if;
    if p_commission_reason is null or length(trim(p_commission_reason)) = 0 then
      raise exception 'A reason is required for a commission change'
        using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('affn.audit_reason', trim(p_note), true);
  update public.event_vendors set status = p_decision where id = v_ev.id;
  perform set_config('affn.audit_reason', '', true);

  insert into public.application_reviews (
    organization_id, event_id, event_vendor_id, vendor_id, from_status, to_status, note, actor_id
  ) values (
    v_ev.organization_id, v_ev.event_id, v_ev.id, v_ev.vendor_id, v_ev.status, p_decision,
    trim(p_note), v_actor
  );

  if p_decision = 'approved' then
    select st.fee_ore into v_fee from public.stall_types st where st.id = v_ev.stall_type_id;
    if v_fee is null then
      raise exception 'The application has no stall type' using errcode = 'check_violation';
    end if;
    -- The event's mva rate on stall fees (PRD §12), rounded half-up to whole øre.
    select e.stall_fee_mva_bp into v_mva_bp from public.events e where e.id = v_ev.event_id;
    v_mva := (v_fee * v_mva_bp * 2 + 10000) / 20000;

    insert into public.stall_fees (
      organization_id, event_id, event_vendor_id, vendor_id, amount_ore, mva_ore, total_ore,
      status, due_at, created_by
    ) values (
      v_ev.organization_id, v_ev.event_id, v_ev.id, v_ev.vendor_id, v_fee, v_mva, v_fee + v_mva,
      'invoiced', now() + interval '14 days', v_actor
    ) returning id into v_stall_fee_id;

    insert into public.invoices (
      organization_id, event_id, kind, vendor_id, stall_fee_id, subtotal_ore, mva_ore,
      total_ore, due_at, mva_rate_bp
    ) values (
      v_ev.organization_id, v_ev.event_id, 'stall_fee', v_ev.vendor_id, v_stall_fee_id, v_fee,
      v_mva, v_fee + v_mva, now() + interval '14 days', v_mva_bp
    ) returning id, invoice_number into v_invoice_id, v_invoice_number;

    if p_commission_rate_bp is not null then
      insert into public.commission_rules (
        organization_id, scope, event_id, vendor_id, type, rate_bp, effective_from, reason,
        created_by
      ) values (
        v_ev.organization_id, 'vendor', v_ev.event_id, v_ev.vendor_id, 'percentage',
        p_commission_rate_bp, now(), trim(p_commission_reason), v_actor
      ) returning id into v_rule_id;
    end if;
  end if;

  return jsonb_build_object(
    'status', p_decision,
    'stall_fee_id', v_stall_fee_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'commission_rule_id', v_rule_id
  );
end;
$$;

-- AFFN commission invoices for a released settlement (SET-04), server code only, idempotent.
-- One per vendor line: the commission and its mva the ledger posted for the vendor in the line's
-- period (charged on sales, less what refunds gave back), settled by deduction from the payout.
-- A period whose refunds gave back more than it charged gets no invoice (the earlier invoice
-- stands; the statement shows the reversal).
create function public.issue_commission_invoices(p_settlement_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.settlements;
  v_event_name text;
  v_line record;
  v_count integer := 0;
begin
  -- Locked, so concurrent calls for the same batch issue each invoice once.
  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v_settlement.status not in ('approved', 'releasing', 'completed', 'completed_with_failures') then
    raise exception 'not_approved' using errcode = 'check_violation';
  end if;
  select name into v_event_name from public.events where id = v_settlement.event_id;

  for v_line in
    select l.vendor_id, l.period_start, l.cutoff_at,
           coalesce(sum(e.amount_ore) filter (where e.account = 'commission_revenue'
                                              and e.direction = 'credit'), 0) as charged,
           coalesce(sum(e.amount_ore) filter (where e.account = 'commission_revenue'
                                              and e.direction = 'debit'), 0) as reversed,
           coalesce(sum(e.amount_ore) filter (where e.account = 'mva_payable'
                                              and e.direction = 'credit'), 0) as mva_charged,
           coalesce(sum(e.amount_ore) filter (where e.account = 'mva_payable'
                                              and e.direction = 'debit'), 0) as mva_reversed
      from public.settlement_lines l
      left join public.ledger_entries e
        on e.event_id = l.event_id and e.vendor_id = l.vendor_id
       and e.account in ('commission_revenue', 'mva_payable')
       and e.created_at > coalesce(l.period_start, '-infinity') and e.created_at <= l.cutoff_at
     where l.settlement_id = v_settlement.id
       and not exists (
         select 1 from public.invoices i
          where i.settlement_id = v_settlement.id and i.vendor_id = l.vendor_id
            and i.kind = 'commission'
       )
     group by l.vendor_id, l.period_start, l.cutoff_at
     order by l.vendor_id
  loop
    if v_line.charged - v_line.reversed <= 0 then
      continue;
    end if;
    insert into public.invoices (
      organization_id, event_id, kind, vendor_id, settlement_id, subtotal_ore, mva_ore,
      total_ore, status, settled_by_deduction, issued_at, due_at, description, period_from,
      period_to, mva_rate_bp, lines
    ) values (
      v_settlement.organization_id, v_settlement.event_id, 'commission', v_line.vendor_id,
      v_settlement.id, v_line.charged - v_line.reversed, v_line.mva_charged - v_line.mva_reversed,
      v_line.charged - v_line.reversed + v_line.mva_charged - v_line.mva_reversed, 'paid', true,
      now(), now(), 'commission:' || v_event_name, v_line.period_start, v_line.cutoff_at, 2500,
      jsonb_build_array(
        jsonb_build_object('key', 'commission', 'amount_ore', v_line.charged,
                           'mva_ore', v_line.mva_charged)
      ) || case when v_line.reversed > 0 or v_line.mva_reversed > 0 then
        jsonb_build_array(
          jsonb_build_object('key', 'commission_reversed', 'amount_ore', -v_line.reversed,
                             'mva_ore', -v_line.mva_reversed)
        )
      else '[]'::jsonb end
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.issue_commission_invoices(uuid) from public, anon, authenticated;
grant execute on function public.issue_commission_invoices(uuid) to service_role;

-- Generated documents (PDF and CSV), stored immutably: a regeneration is a new version with its
-- own storage path, never an overwrite. Rows are written by server code only.
create type public.document_kind as enum (
  'vendor_statement', 'statement_orders_csv', 'commission_invoice', 'stall_fee_invoice',
  'stall_fee_receipt', 'customer_receipt'
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  event_id uuid,
  kind public.document_kind not null,
  -- What the document is about, as "settlement:<id>:<vendor id>", "invoice:<id>", "order:<id>"…
  subject_key text not null,
  locale text not null check (locale in ('nb', 'en')),
  version integer not null check (version >= 1),
  settlement_id uuid,
  vendor_id uuid references public.vendors (id) on delete restrict,
  invoice_id uuid references public.invoices (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  fee_payment_id uuid references public.fee_payments (id) on delete restrict,
  storage_path text not null unique,
  content_type text not null check (content_type in ('application/pdf', 'text/csv')),
  byte_size integer not null check (byte_size > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, subject_key, locale, version),
  foreign key (event_id, organization_id) references public.events (id, organization_id)
    on delete restrict,
  foreign key (settlement_id, organization_id)
    references public.settlements (id, organization_id) on delete restrict
);
create index documents_organization_id_idx on public.documents (organization_id);
create index documents_event_org_idx on public.documents (event_id, organization_id);
create index documents_settlement_org_idx on public.documents (settlement_id, organization_id);
create index documents_vendor_id_idx on public.documents (vendor_id);
create index documents_invoice_id_idx on public.documents (invoice_id);
create index documents_order_id_idx on public.documents (order_id);
create index documents_fee_payment_id_idx on public.documents (fee_payment_id);
create index documents_created_by_idx on public.documents (created_by);

create trigger documents_append_only before update or delete on public.documents
  for each row execute function private.prevent_mutation();
create trigger documents_no_truncate before truncate on public.documents
  for each statement execute function private.prevent_mutation();

alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;
-- The vendor sees its own documents; staff those of their events (or organization).
create policy documents_select on public.documents for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or (event_id is not null and private.is_event_staff(organization_id, event_id))
    or (event_id is null and private.is_org_staff(organization_id))
  );

-- Private bucket for the files; no client policies (server code reads and writes them).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 20971520, array['application/pdf', 'text/csv'])
on conflict (id) do nothing;
