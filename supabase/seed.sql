-- Local development seed (runs after migrations on `pnpm db:reset`). NOT for production.
-- Fixed UUIDs so tests and docs can refer to rows. Every seeded user's password is "password".
--
-- Users
--   platform@affn.test  Platform Owner
--   admin@affn.test     Organization Admin (African Food Festival Norway)
--   event@affn.test     Event Admin, assigned to AFFN 2027
--   vendor@affn.test    Vendor user for "Mama Afrika Kjøkken"
--   sponsor@affn.test   Sponsor user for "Nordlys Bank"
--   multi@affn.test     Vendor for "Asmara Café" and sponsor for "Fjord Mobil" (role switcher)
--
-- MFA (AUTH-04): platform@ and admin@ have a verified TOTP factor with the dev-only secret
--   KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU
-- Add it to an authenticator app (or use `otplib`) to sign in locally. Never use it elsewhere.

-- Auth users -------------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'platform@affn.test', 'Platform Owner'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'admin@affn.test', 'Org Admin'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'event@affn.test', 'Event Admin'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'vendor@affn.test', 'Ada Okafor'),
  ('00000000-0000-4000-8000-000000000005'::uuid, 'sponsor@affn.test', 'Sponsor Contact'),
  ('00000000-0000-4000-8000-000000000006'::uuid, 'multi@affn.test', 'Yonas Gebre')
) as u (id, email, name);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
select gen_random_uuid(), u.id, 'Dev authenticator', 'totp', 'verified',
       'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU', now(), now()
  from auth.users u
 where u.email in ('platform@affn.test', 'admin@affn.test');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
  from auth.users u
 where u.email like '%@affn.test';

-- Tenancy -----------------------------------------------------------------------------------------
insert into public.organizations (id, name, slug, org_number) values
  ('10000000-0000-4000-8000-000000000001', 'African Food Festival Norway', 'affn', '923456781');

insert into public.events (id, organization_id, name, slug, status, starts_at, ends_at, venue_name, venue_address, description) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'AFFN 2027', 'affn-2027', 'published',
   '2027-06-12 08:00:00+00', '2027-06-13 20:00:00+00',
   'Tøyenparken', 'Tøyenparken, 0578 Oslo',
   'African Food Festival Norway 2027 – to dager med mat, musikk og kultur.');

-- Key dates and stall types for "Become a vendor" (placeholders until the price list is set,
-- PRD §12; owner decision P05).
update public.events
   set applications_open_at = '2026-10-01 08:00:00+00',
       application_deadline = '2027-03-31 21:59:00+00',
       decisions_by = '2027-04-30 21:59:00+00'
 where id = '20000000-0000-4000-8000-000000000001';

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
   'A table in the market for packaged goods, fashion and crafts.', '3 × 2 m', 300, 200, 150000, 3);

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-000000000001');

insert into public.memberships (organization_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'org_admin'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'event_admin');

insert into public.event_admins (organization_id, event_id, user_id) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000003');

-- Catalogue categories ------------------------------------------------------------------------------
insert into public.product_categories (id, organization_id, slug, name_nb, name_en, sort_order) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'main-dishes', 'Hovedretter', 'Main dishes', 1),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'street-food', 'Gatemat', 'Street food', 2),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'drinks', 'Drikke', 'Drinks', 3),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'desserts', 'Dessert', 'Desserts', 4);

-- Vendors ---------------------------------------------------------------------------------------------
insert into public.vendors (id, organization_id, org_number, legal_name, display_name, slug, business_form,
  brreg_verified_at, brreg_status, category, cuisine_country, description, public_email, instagram_handle,
  offers_catering, profile_published) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '912345670',
   'Mama Afrika Kjøkken Okafor', 'Mama Afrika Kjøkken', 'mama-afrika-kjokken', 'ENK', now(), 'active',
   'hot-food', 'NG', 'Nigeriansk hjemmelaget mat: jollof, suya og puff-puff.', 'hei@mamaafrika.example',
   'mamaafrikakjokken', true, true),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '923456789',
   'Jollof House Oslo AS', 'Jollof House Oslo', 'jollof-house-oslo', 'AS', now(), 'active',
   'hot-food', 'GH', 'Ghanesisk jollof og kelewele.', 'post@jollofhouse.example', 'jollofhouseoslo', true, true),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '934567890',
   'Addis Injera Tesfaye', 'Addis Injera', 'addis-injera', 'ENK', now(), 'active',
   'hot-food', 'ET', 'Etiopisk injera med wat og misir.', null, null, false, false),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '945678901',
   'Zanzibar Spice AS', 'Zanzibar Spice', 'zanzibar-spice', 'AS', now(), 'active',
   'street-food', 'TZ', 'Krydret mat fra Zanzibar.', null, null, false, false),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '956789012',
   'Asmara Café Gebre', 'Asmara Café', 'asmara-cafe', 'ENK', now(), 'active',
   'drinks-coffee', 'ER', 'Eritreisk kaffeseremoni og søtsaker.', 'kaffe@asmara.example', 'asmaracafe', false, true);

insert into public.vendor_contacts (vendor_id, organization_id, contact_name, contact_email, contact_phone)
select v.id, v.organization_id, c.name, c.email, c.phone
  from public.vendors v
  join (values
    ('40000000-0000-4000-8000-000000000001'::uuid, 'Ada Okafor', 'vendor@affn.test', '+47 400 00 001'),
    ('40000000-0000-4000-8000-000000000002'::uuid, 'Kwame Mensah', 'kwame@jollofhouse.example', '+47 400 00 002'),
    ('40000000-0000-4000-8000-000000000003'::uuid, 'Selam Tesfaye', 'selam@addis.example', '+47 400 00 003'),
    ('40000000-0000-4000-8000-000000000004'::uuid, 'Amina Juma', 'amina@zanzibar.example', '+47 400 00 004'),
    ('40000000-0000-4000-8000-000000000005'::uuid, 'Yonas Gebre', 'yonas@asmara.example', '+47 400 00 005')
  ) as c (vendor_id, name, email, phone) on c.vendor_id = v.id;

insert into public.memberships (organization_id, user_id, role, vendor_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'vendor',
   '40000000-0000-4000-8000-000000000001');

insert into public.event_vendors (id, organization_id, event_id, vendor_id, status, submitted_at, decided_at,
  needs_power, needs_water, psp_account_status, is_published) values
  ('41000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'approved', now() - interval '30 days', now() - interval '20 days', true, true, 'eligible', true),
  ('41000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000002', 'approved', now() - interval '28 days', now() - interval '18 days', true, false, 'eligible', true),
  ('41000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000003', 'under_review', now() - interval '5 days', null, true, true, 'not_started', false),
  ('41000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000004', 'draft', null, null, false, false, 'not_started', false),
  ('41000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000005', 'approved', now() - interval '25 days', now() - interval '15 days', true, false, 'pending', true);

insert into public.commission_rules (id, organization_id, scope, type, rate_bp, effective_from, reason, created_by) values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'organization', 'percentage', 1000,
   '2026-01-01 00:00:00+00', 'Standard rate "10 % + mva" (decision D3)', '00000000-0000-4000-8000-000000000002');

-- Stalls ----------------------------------------------------------------------------------------------
insert into public.stalls (id, organization_id, event_id, number, zone, size_label, width_cm, depth_cm,
  has_power, has_water, is_premium, fee_ore, map_x, map_y)
select ('50000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       case when n <= 5 then 'A' || n else 'B' || (n - 5) end,
       case when n <= 5 then 'Food court' else 'Market' end,
       case when n in (1, 6) then '3 × 6 m' else '3 × 3 m' end,
       300, case when n in (1, 6) then 600 else 300 end,
       n <= 7, n <= 3, n in (1, 6),
       case when n in (1, 6) then 400000 else 250000 end,
       1000 + n * 800, case when n <= 5 then 3000 else 6500 end
  from generate_series(1, 10) as n;

insert into public.stall_assignments (organization_id, event_id, stall_id, event_vendor_id, vendor_id, assigned_by) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
   '41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
   '41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000006',
   '41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003');

-- Products: 4 per vendor ------------------------------------------------------------------------------
insert into public.products (id, organization_id, vendor_id, category_id, name, description, price_ore, dietary_tags, allergens)
select ('60000000-0000-4000-8000-0000000000' || lpad(p.n::text, 2, '0'))::uuid,
       '10000000-0000-4000-8000-000000000001',
       ('40000000-0000-4000-8000-00000000000' || ((p.n - 1) / 4 + 1))::uuid,
       ('30000000-0000-4000-8000-00000000000' || p.cat)::uuid,
       p.name, p.description, p.price_ore, p.tags::public.dietary_tag[], p.allergens::public.allergen[]
  from (values
    (1,  1, 'Jollof-ris med kylling', 'Røkt tomat, paprika og grillet kylling.', 18500, '{halal,spicy}', '{}'),
    (2,  2, 'Suya-spyd', 'Grillet storfe med peanøttkrydder.', 15500, '{halal,spicy}', '{peanuts}'),
    (3,  4, 'Puff-puff', 'Søte, friterte deigkuler.', 6000, '{vegetarian}', '{gluten,eggs,milk}'),
    (4,  3, 'Zobo', 'Kald hibiskusdrikk med ingefær.', 4500, '{vegan}', '{}'),
    (5,  1, 'Ghanesisk jollof', 'Med stekt plantain.', 17500, '{vegan,spicy}', '{}'),
    (6,  2, 'Kelewele', 'Krydret, stekt plantain.', 7500, '{vegan,spicy}', '{}'),
    (7,  1, 'Waakye', 'Ris og bønner med shito.', 16500, '{halal}', '{fish}'),
    (8,  3, 'Sobolo', 'Hibiskus med ananas.', 4500, '{vegan}', '{}'),
    (9,  1, 'Injera med doro wat', 'Kyllinggryte med berbere.', 19500, '{halal,spicy}', '{gluten,eggs}'),
    (10, 1, 'Misir wat', 'Røde linser i berbere.', 15500, '{vegan,spicy}', '{gluten}'),
    (11, 1, 'Shiro', 'Kikertgryte.', 14500, '{vegan}', '{gluten}'),
    (12, 3, 'Etiopisk kaffe', 'Brent på stedet.', 4000, '{vegan}', '{}'),
    (13, 1, 'Pilau', 'Krydret ris med storfe.', 18000, '{halal}', '{}'),
    (14, 2, 'Zanzibar-pizza', 'Fylt, stekt deig.', 12000, '{}', '{gluten,eggs}'),
    (15, 2, 'Mishkaki', 'Marinert storfespyd.', 13500, '{halal}', '{}'),
    (16, 4, 'Mandazi', 'Kokos-doughnuts.', 5000, '{vegetarian}', '{gluten,milk}'),
    (17, 3, 'Jebena-kaffe', 'Tradisjonell kaffeseremoni.', 6000, '{vegan}', '{}'),
    (18, 3, 'Shahi', 'Krydret te.', 3500, '{vegetarian}', '{milk}'),
    (19, 4, 'Himbasha', 'Søtt brød med kardemomme.', 5500, '{vegetarian}', '{gluten,milk}'),
    (20, 4, 'Ambasha', 'Festbrød med honning.', 6000, '{vegetarian}', '{gluten}')
  ) as p (n, cat, name, description, price_ore, tags, allergens);

insert into public.product_availability (organization_id, event_id, event_vendor_id, vendor_id, product_id, sort_order)
select ev.organization_id, ev.event_id, ev.id, ev.vendor_id, p.id, row_number() over (partition by p.vendor_id order by p.id)
  from public.event_vendors ev
  join public.products p on p.vendor_id = ev.vendor_id
 where ev.status = 'approved';

-- Sponsors ----------------------------------------------------------------------------------------------
insert into public.sponsors (id, organization_id, name, org_number, website_url, contact_name, contact_email, invoice_email) values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Nordlys Bank', '967890123',
   'https://nordlysbank.example', 'Sponsor Contact', 'sponsor@affn.test', 'faktura@nordlysbank.example'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Fjord Mobil', '978901234',
   'https://fjordmobil.example', 'Ingrid Berg', 'ingrid@fjordmobil.example', 'faktura@fjordmobil.example');

insert into public.memberships (organization_id, user_id, role, sponsor_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'sponsor',
   '80000000-0000-4000-8000-000000000001');

-- One person with two roles, to exercise the role switcher.
insert into public.memberships (organization_id, user_id, role, vendor_id, sponsor_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000006', 'vendor',
   '40000000-0000-4000-8000-000000000005', null),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000006', 'sponsor',
   null, '80000000-0000-4000-8000-000000000002');

insert into public.sponsor_packages (id, organization_id, event_id, name, tier, price_ore, description, deliverables) values
  ('81000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Gull', 1, 15000000, 'Hovedsponsor', '{"Logo på hovedscenen","QR-kode ved inngangen","Rapport etter festivalen"}'),
  ('81000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'Sølv', 2, 5000000, 'Partner', '{"Logo på nettsiden","Rapport etter festivalen"}');

insert into public.sponsorships (id, organization_id, event_id, sponsor_id, package_id, status, agreed_price_ore) values
  ('82000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'confirmed', 15000000),
  ('82000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '80000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'inquiry', null);

insert into public.tracked_links (id, organization_id, event_id, kind, slug, target_url, label, sponsorship_id, sponsor_id) values
  ('83000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'qr', 'nordlys-inngang', 'https://nordlysbank.example/affn', 'QR ved inngangen',
   '82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001');
