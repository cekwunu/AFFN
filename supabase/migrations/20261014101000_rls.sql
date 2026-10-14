-- Row-level security for every table (PRD §4, NFR-06).
--
-- Model:
--   * authenticated: one permissive policy per table and action, combining the roles
--     (platform owner, organization admin, event admin, vendor, sponsor).
--   * anon (visitors): read-only policies on published content. Public pages always query as
--     anon, so authenticated users do not get the public rows on top of their own.
--   * Writes that visitors trigger (checkout, scans, page views, leads) and all money writes go
--     through server code with the service role, never directly from the browser.
--   * Grants are explicit: nothing is reachable without a grant AND a policy.

-- Start from zero, then enable RLS everywhere in public.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- Grants: authenticated --------------------------------------------------------------------------

grant select on all tables in schema public to authenticated;
revoke select on public.invoice_counters from authenticated;

grant insert on
  public.organizations, public.memberships, public.event_admins, public.events,
  public.product_categories, public.vendors, public.vendor_contacts, public.vendor_documents,
  public.event_vendors, public.vendor_agreements, public.application_reviews,
  public.internal_notes, public.stalls, public.stall_assignments, public.products,
  public.product_availability, public.commission_rules, public.settlements,
  public.settlement_lines, public.settlement_adjustments, public.stall_fees, public.sponsors,
  public.sponsor_packages, public.sponsorships, public.sponsor_assets, public.tracked_links
  to authenticated;

grant update on
  public.organizations, public.memberships, public.events, public.product_categories,
  public.vendor_contacts, public.vendor_documents, public.stalls, public.stall_assignments,
  public.products, public.product_availability, public.settlements, public.settlement_lines,
  public.settlement_adjustments, public.stall_fees, public.sponsors, public.sponsor_packages,
  public.sponsorships, public.sponsor_assets
  to authenticated;

-- Column-limited updates: identity, registry and payment-provider fields are changed only by
-- audited server code.
grant update (
  display_name, category, cuisine_country, description, story, logo_path, cover_image_path,
  public_email, public_phone, website_url, instagram_handle, facebook_url, tiktok_handle,
  offers_catering, mva_registered, profile_published
) on public.vendors to authenticated;
grant update (
  status, submitted_at, decided_at, needs_power, needs_water, requested_stall_size,
  application_notes, is_published, is_paused
) on public.event_vendors to authenticated;
grant update (status, accepted_at, ready_at, collected_at, cancelled_at)
  on public.orders to authenticated;
grant update (status) on public.leads to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant delete on
  public.memberships, public.event_admins, public.vendor_contacts, public.vendor_documents,
  public.internal_notes, public.stalls, public.stall_assignments, public.product_availability,
  public.settlement_lines, public.settlement_adjustments, public.sponsor_packages,
  public.sponsor_assets, public.tracked_links, public.leads, public.notifications
  to authenticated;

-- Grants: anon (published content only, public columns only) ---------------------------------

grant select (id, name, slug, default_locale) on public.organizations to anon;
grant select (
  id, organization_id, name, slug, status, starts_at, ends_at, venue_name, venue_address,
  description
) on public.events to anon;
grant select (id, organization_id, slug, name_nb, name_en, sort_order)
  on public.product_categories to anon;
grant select (
  id, organization_id, org_number, legal_name, display_name, slug, business_form, category,
  cuisine_country, description, story, logo_path, cover_image_path, public_email, public_phone,
  website_url, instagram_handle, facebook_url, tiktok_handle, offers_catering, mva_registered,
  profile_published
) on public.vendors to anon;
grant select (id, organization_id, event_id, vendor_id, status, qr_slug, is_published, is_paused)
  on public.event_vendors to anon;
grant select (
  id, organization_id, vendor_id, category_id, name, description, price_ore, mva_rate_bp,
  image_path, dietary_tags, allergens, archived_at
) on public.products to anon;
grant select (id, organization_id, event_id, event_vendor_id, vendor_id, product_id,
  is_available, sort_order) on public.product_availability to anon;

-- Policies: tenancy -------------------------------------------------------------------------------

create policy organizations_select on public.organizations for select to authenticated
  using ((select private.is_platform_owner()) or id = any ((select private.my_org_ids())::uuid[]));
create policy organizations_insert on public.organizations for insert to authenticated
  with check ((select private.is_platform_owner()));
create policy organizations_update on public.organizations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy organizations_public on public.organizations for select to anon
  using (private.org_is_public(id));

create policy platform_admins_select on public.platform_admins for select to authenticated
  using ((select private.is_platform_owner()) or user_id = (select auth.uid()));

-- Vendor and sponsor memberships may only name a business of the same organization, so an
-- admin cannot attach a user to another tenant's vendor.
create policy memberships_select on public.memberships for select to authenticated
  using (
    (select private.is_platform_owner())
    or user_id = (select auth.uid())
    or private.is_org_admin(organization_id)
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (
    (
      private.is_org_admin(organization_id)
      or ((select private.is_platform_owner()) and role = 'org_admin')
    )
    and (vendor_id is null or exists (
      select 1 from public.vendors v
       where v.id = vendor_id and v.organization_id = memberships.organization_id))
    and (sponsor_id is null or exists (
      select 1 from public.sponsors s
       where s.id = sponsor_id and s.organization_id = memberships.organization_id))
  );
create policy memberships_update on public.memberships for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (
    private.is_org_admin(organization_id)
    and (vendor_id is null or exists (
      select 1 from public.vendors v
       where v.id = vendor_id and v.organization_id = memberships.organization_id))
    and (sponsor_id is null or exists (
      select 1 from public.sponsors s
       where s.id = sponsor_id and s.organization_id = memberships.organization_id))
  );
create policy memberships_delete on public.memberships for delete to authenticated
  using (private.is_org_admin(organization_id));

create policy event_admins_select on public.event_admins for select to authenticated
  using (
    (select private.is_platform_owner())
    or user_id = (select auth.uid())
    or private.is_org_admin(organization_id)
  );
create policy event_admins_insert on public.event_admins for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy event_admins_delete on public.event_admins for delete to authenticated
  using (private.is_org_admin(organization_id));

create policy events_select on public.events for select to authenticated
  using (
    (select private.is_platform_owner()) or organization_id = any ((select private.my_org_ids())::uuid[])
  );
create policy events_insert on public.events for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy events_update on public.events for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy events_public on public.events for select to anon
  using (status in ('published', 'closed'));

create policy product_categories_select on public.product_categories for select to authenticated
  using (
    (select private.is_platform_owner()) or organization_id = any ((select private.my_org_ids())::uuid[])
  );
create policy product_categories_insert on public.product_categories for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy product_categories_update on public.product_categories for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy product_categories_public on public.product_categories for select to anon
  using (private.org_is_public(organization_id));

-- Policies: vendors and applications --------------------------------------------------------------

create policy vendors_select on public.vendors for select to authenticated
  using (
    (select private.is_platform_owner())
    or id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(id)
  );
create policy vendors_insert on public.vendors for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy vendors_update on public.vendors for update to authenticated
  using (id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id))
  with check (id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id));
create policy vendors_public on public.vendors for select to anon
  using (profile_published);

create policy vendor_contacts_select on public.vendor_contacts for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(vendor_id)
  );
create policy vendor_contacts_insert on public.vendor_contacts for insert to authenticated
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id)
  );
create policy vendor_contacts_update on public.vendor_contacts for update to authenticated
  using (vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id))
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id)
  );
create policy vendor_contacts_delete on public.vendor_contacts for delete to authenticated
  using (private.is_org_admin(organization_id));

create policy vendor_documents_select on public.vendor_documents for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(vendor_id)
  );
create policy vendor_documents_insert on public.vendor_documents for insert to authenticated
  with check (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[]) and status = 'pending'
     and reviewed_by is null)
    or private.is_org_admin(organization_id)
  );
-- Vendors edit their documents while pending; reviewers (any organization the vendor applies to)
-- set the review outcome.
create policy vendor_documents_update on public.vendor_documents for update to authenticated
  using (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[]) and status = 'pending')
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(vendor_id)
  )
  with check (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[]) and status = 'pending'
     and reviewed_by is null)
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(vendor_id)
  );
create policy vendor_documents_delete on public.vendor_documents for delete to authenticated
  using (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[]) and status = 'pending')
    or private.is_org_admin(organization_id)
  );

-- Vendors create and edit their own application until it is under review; event staff decide.
create policy event_vendors_select on public.event_vendors for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy event_vendors_insert on public.event_vendors for insert to authenticated
  with check (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[])
     and status in ('draft', 'submitted') and not is_published)
    or private.is_org_admin(organization_id)
  );
create policy event_vendors_update on public.event_vendors for update to authenticated
  using (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[])
     and status in ('draft', 'more_info_requested'))
    or private.is_event_staff(organization_id, event_id)
  )
  with check (
    (vendor_id = any ((select private.my_vendor_ids())::uuid[])
     and status in ('draft', 'submitted') and not is_published)
    or private.is_event_staff(organization_id, event_id)
  );
create policy event_vendors_public on public.event_vendors for select to anon
  using (private.event_vendor_is_public(id));

create policy vendor_agreements_select on public.vendor_agreements for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy vendor_agreements_insert on public.vendor_agreements for insert to authenticated
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[]) and accepted_by = (select auth.uid())
  );

create policy application_reviews_select on public.application_reviews for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy application_reviews_insert on public.application_reviews for insert to authenticated
  with check (
    private.is_event_staff(organization_id, event_id) and actor_id = (select auth.uid())
  );

create policy internal_notes_select on public.internal_notes for select to authenticated
  using ((select private.is_platform_owner()) or private.is_event_staff(organization_id, event_id));
create policy internal_notes_insert on public.internal_notes for insert to authenticated
  with check (
    private.is_event_staff(organization_id, event_id) and author_id = (select auth.uid())
  );
create policy internal_notes_delete on public.internal_notes for delete to authenticated
  using (author_id = (select auth.uid()) and private.is_event_staff(organization_id, event_id));

-- Policies: stalls and catalogue ------------------------------------------------------------------

create policy stalls_select on public.stalls for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_event_staff(organization_id, event_id)
    or exists (
      select 1 from public.stall_assignments sa
       where sa.stall_id = stalls.id and sa.status = 'active'
         and sa.vendor_id = any ((select private.my_vendor_ids())::uuid[])
    )
  );
create policy stalls_insert on public.stalls for insert to authenticated
  with check (private.is_event_staff(organization_id, event_id));
create policy stalls_update on public.stalls for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));
create policy stalls_delete on public.stalls for delete to authenticated
  using (private.is_event_staff(organization_id, event_id));

create policy stall_assignments_select on public.stall_assignments for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy stall_assignments_insert on public.stall_assignments for insert to authenticated
  with check (private.is_event_staff(organization_id, event_id));
create policy stall_assignments_update on public.stall_assignments for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));
create policy stall_assignments_delete on public.stall_assignments for delete to authenticated
  using (private.is_event_staff(organization_id, event_id));

create policy products_select on public.products for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_staff(organization_id)
    or private.staff_can_see_vendor(vendor_id)
  );
create policy products_insert on public.products for insert to authenticated
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id)
  );
create policy products_update on public.products for update to authenticated
  using (vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id))
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id)
  );
create policy products_public on public.products for select to anon
  using (archived_at is null and private.vendor_is_public(vendor_id));

create policy product_availability_select on public.product_availability for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy product_availability_insert on public.product_availability for insert to authenticated
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy product_availability_update on public.product_availability for update to authenticated
  using (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  )
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy product_availability_delete on public.product_availability for delete to authenticated
  using (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy product_availability_public on public.product_availability for select to anon
  using (private.event_vendor_is_public(event_vendor_id));

-- Policies: commerce (writes happen in server code; vendors move order status) ------------------

create policy orders_select on public.orders for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy orders_update on public.orders for update to authenticated
  using (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  )
  with check (
    vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

create policy order_items_select on public.order_items for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

create policy payments_select on public.payments for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

create policy refunds_select on public.refunds for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

-- Policies: money -------------------------------------------------------------------------------

-- Vendors see their own rates and the defaults that apply to them. Only Organization Admins
-- create rules (COM-03); rules are never edited or deleted.
create policy commission_rules_select on public.commission_rules for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_org_staff(organization_id)
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or (
      vendor_id is null
      and cardinality((select private.my_vendor_ids())::uuid[]) > 0
      and organization_id = any ((select private.my_org_ids())::uuid[])
    )
  );
create policy commission_rules_insert on public.commission_rules for insert to authenticated
  with check (private.is_org_admin(organization_id) and created_by = (select auth.uid()));

create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

-- Event staff prepare settlements; approval rules (Organization Admin, four eyes) are enforced
-- by the settlement workflow trigger.
create policy settlements_select on public.settlements for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_event_staff(organization_id, event_id)
    or exists (
      select 1 from public.settlement_lines l
       where l.settlement_id = settlements.id
         and l.vendor_id = any ((select private.my_vendor_ids())::uuid[])
    )
  );
create policy settlements_insert on public.settlements for insert to authenticated
  with check (private.is_event_staff(organization_id, event_id) and status = 'draft');
create policy settlements_update on public.settlements for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));

create policy settlement_lines_select on public.settlement_lines for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy settlement_lines_insert on public.settlement_lines for insert to authenticated
  with check (
    private.is_event_staff(organization_id, event_id) and private.settlement_is_draft(settlement_id)
  );
create policy settlement_lines_update on public.settlement_lines for update to authenticated
  using (
    private.is_event_staff(organization_id, event_id) and private.settlement_is_draft(settlement_id)
  )
  with check (
    private.is_event_staff(organization_id, event_id) and private.settlement_is_draft(settlement_id)
  );
create policy settlement_lines_delete on public.settlement_lines for delete to authenticated
  using (
    private.is_event_staff(organization_id, event_id) and private.settlement_is_draft(settlement_id)
  );

create policy settlement_adjustments_select on public.settlement_adjustments for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy settlement_adjustments_insert on public.settlement_adjustments for insert to authenticated
  with check (
    private.is_event_staff(organization_id, event_id)
    and created_by = (select auth.uid()) and approved_by is null
  );
-- Approval of an adjustment: Organization Admin, recorded as the approver.
create policy settlement_adjustments_update on public.settlement_adjustments for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id) and approved_by = (select auth.uid()));
create policy settlement_adjustments_delete on public.settlement_adjustments for delete to authenticated
  using (private.is_event_staff(organization_id, event_id) and approved_by is null);

create policy payouts_select on public.payouts for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

create policy invoices_select on public.invoices for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

create policy stall_fees_select on public.stall_fees for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy stall_fees_insert on public.stall_fees for insert to authenticated
  with check (private.is_event_staff(organization_id, event_id));
create policy stall_fees_update on public.stall_fees for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));

create policy fee_payments_select on public.fee_payments for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );

-- invoice_counters: no policies and no grants; only the invoice-number trigger writes it.

-- Policies: sponsors and engagement ---------------------------------------------------------------

create policy sponsors_select on public.sponsors for select to authenticated
  using (
    (select private.is_platform_owner())
    or id = any ((select private.my_sponsor_ids())::uuid[])
    or private.is_org_staff(organization_id)
  );
create policy sponsors_insert on public.sponsors for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy sponsors_update on public.sponsors for update to authenticated
  using (id = any ((select private.my_sponsor_ids())::uuid[]) or private.is_org_admin(organization_id))
  with check (id = any ((select private.my_sponsor_ids())::uuid[]) or private.is_org_admin(organization_id));

-- Staff, and sponsors of the organization choosing a package (SPO-01).
create policy sponsor_packages_select on public.sponsor_packages for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_event_staff(organization_id, event_id)
    or (
      cardinality((select private.my_sponsor_ids())::uuid[]) > 0
      and organization_id = any ((select private.my_org_ids())::uuid[])
    )
  );
create policy sponsor_packages_insert on public.sponsor_packages for insert to authenticated
  with check (private.is_event_staff(organization_id, event_id));
create policy sponsor_packages_update on public.sponsor_packages for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));
create policy sponsor_packages_delete on public.sponsor_packages for delete to authenticated
  using (private.is_event_staff(organization_id, event_id));

create policy sponsorships_select on public.sponsorships for select to authenticated
  using (
    (select private.is_platform_owner())
    or sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy sponsorships_insert on public.sponsorships for insert to authenticated
  with check (
    (sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
     and status = 'inquiry' and agreed_price_ore is null)
    or private.is_event_staff(organization_id, event_id)
  );
create policy sponsorships_update on public.sponsorships for update to authenticated
  using (private.is_event_staff(organization_id, event_id))
  with check (private.is_event_staff(organization_id, event_id));

create policy sponsor_assets_select on public.sponsor_assets for select to authenticated
  using (
    (select private.is_platform_owner())
    or sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
    or private.is_event_staff(organization_id, event_id)
  );
create policy sponsor_assets_insert on public.sponsor_assets for insert to authenticated
  with check (
    (sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
     and status = 'pending' and reviewed_by is null)
    or private.is_event_staff(organization_id, event_id)
  );
create policy sponsor_assets_update on public.sponsor_assets for update to authenticated
  using (
    (sponsor_id = any ((select private.my_sponsor_ids())::uuid[]) and status = 'pending')
    or private.is_event_staff(organization_id, event_id)
  )
  with check (
    (sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
     and status = 'pending' and reviewed_by is null)
    or private.is_event_staff(organization_id, event_id)
  );
create policy sponsor_assets_delete on public.sponsor_assets for delete to authenticated
  using (
    (sponsor_id = any ((select private.my_sponsor_ids())::uuid[]) and status = 'pending')
    or private.is_event_staff(organization_id, event_id)
  );

create policy tracked_links_select on public.tracked_links for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_event_staff(organization_id, event_id)
    or sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
  );
create policy tracked_links_insert on public.tracked_links for insert to authenticated
  with check (private.is_event_staff(organization_id, event_id));
create policy tracked_links_delete on public.tracked_links for delete to authenticated
  using (private.is_event_staff(organization_id, event_id));

create policy qr_scans_select on public.qr_scans for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_event_staff(organization_id, event_id)
    or exists (
      select 1 from public.tracked_links tl
       where tl.id = qr_scans.tracked_link_id
         and (tl.sponsor_id = any ((select private.my_sponsor_ids())::uuid[])
              or tl.vendor_id = any ((select private.my_vendor_ids())::uuid[]))
    )
  );

create policy page_views_select on public.page_views for select to authenticated
  using (
    (select private.is_platform_owner())
    or private.is_org_staff(organization_id)
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
  );

create policy leads_select on public.leads for select to authenticated
  using (
    (select private.is_platform_owner())
    or vendor_id = any ((select private.my_vendor_ids())::uuid[])
    or private.is_org_admin(organization_id)
  );
create policy leads_update on public.leads for update to authenticated
  using (vendor_id = any ((select private.my_vendor_ids())::uuid[]))
  with check (vendor_id = any ((select private.my_vendor_ids())::uuid[]));
create policy leads_delete on public.leads for delete to authenticated
  using (vendor_id = any ((select private.my_vendor_ids())::uuid[]) or private.is_org_admin(organization_id));

-- Policies: platform ----------------------------------------------------------------------------

create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_admin(organization_id));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy psp_webhook_events_select on public.psp_webhook_events for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_admin(organization_id));

create policy psp_webhook_attempts_select on public.psp_webhook_attempts for select to authenticated
  using ((select private.is_platform_owner()) or private.is_org_admin(organization_id));
