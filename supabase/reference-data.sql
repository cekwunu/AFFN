-- Reference data for the cloud project (owner approved, P05): the organization, the current
-- event and the commercial placeholders the public pages read. No users and no demo vendors.
-- Prices, dates and the commission rate are placeholders until PRD §12 is closed; change them in
-- the database (commission rules: add a new rule, never edit). Same ids as supabase/seed.sql.
-- Idempotent: safe to run again.

insert into public.organizations (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'African Food Festival Norway', 'affn')
on conflict (id) do nothing;

insert into public.events (id, organization_id, name, slug, status, starts_at, ends_at,
  venue_name, venue_address, description, applications_open_at, application_deadline,
  decisions_by) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'AFFN 2027', 'affn-2027', 'published',
   '2027-06-12 08:00:00+00', '2027-06-13 20:00:00+00',
   'Tøyenparken', 'Tøyenparken, 0578 Oslo',
   'African Food Festival Norway 2027 – to dager med mat, musikk og kultur.',
   '2026-10-01 08:00:00+00', '2027-03-31 21:59:00+00', '2027-04-30 21:59:00+00')
on conflict (id) do nothing;

insert into public.product_categories (id, organization_id, slug, name_nb, name_en, sort_order) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'main-dishes', 'Hovedretter', 'Main dishes', 1),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'street-food', 'Gatemat', 'Street food', 2),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'drinks', 'Drikke', 'Drinks', 3),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'desserts', 'Dessert', 'Desserts', 4)
on conflict (id) do nothing;

insert into public.commission_rules (id, organization_id, scope, type, rate_bp, effective_from, reason) values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'organization',
   'percentage', 1000, '2026-01-01 00:00:00+00',
   'Standard rate "10 % + mva" (decision D3); placeholder until PRD §12 is closed')
on conflict (id) do nothing;

insert into public.stall_types (id, organization_id, event_id, name_nb, name_en, description_nb,
  description_en, size_label, width_cm, depth_cm, fee_ore, sort_order) values
  ('52000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Standard', 'Standard', 'Plass til telt og ett kjøkken. Passer de fleste matboder.',
   'Room for a tent and one kitchen. Suits most food stalls.', '3 × 3 m', 300, 300, 250000, 1),
  ('52000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Stor', 'Large', 'Dobbel plass for større kjøkken og kø.',
   'Double space for a bigger kitchen and queue.', '3 × 6 m', 300, 600, 400000, 2),
  ('52000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Markedsbord', 'Market table', 'Bord i markedet for pakkede varer, klær og håndverk.',
   'A table in the market for packaged goods, fashion and crafts.', '3 × 2 m', 300, 200, 150000, 3)
on conflict (id) do nothing;
