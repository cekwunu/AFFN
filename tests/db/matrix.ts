// What each role may read and write, per table (PRD §4). One entry per table in `public`;
// rls.test.ts fails if a table is missing. Labels name fixture rows:
//   own     – belongs to vendor 1 / sponsor 1 / AFFN 2027 (the seeded test users)
//   other   – vendor 2 / sponsor 2 / another event in the same organization
//   foreign – a second organization
import type { Role } from './db';
import {
  CATEGORY1,
  COMMISSION_DEFAULT,
  EVENT1,
  EVENT2,
  EVENT3,
  EVENT_VENDOR,
  ORG1,
  ORG2,
  PACKAGE,
  PRODUCT,
  SETTLEMENT,
  SPONSOR,
  SPONSORSHIP,
  STALL,
  STALL_TYPE,
  USERS,
  VENDOR,
  row,
} from './ids';

export interface TableSpec {
  table: string;
  /** Column used for no-op update attempts when nobody may update. */
  pk?: string;
  /** label → SQL predicate selecting the fixture row(s). */
  rows: Record<string, string>;
  /** label → roles that can see those rows. */
  read: Record<string, Role[]>;
  insert?: { allowed: Role[]; row: (uid: string | null) => Record<string, unknown> };
  update?: { allowed: Role[]; target: string; set: (uid: string | null) => string };
  delete?: { allowed: Role[]; target: string };
}

const P: Role = 'platformOwner';
const FOREIGN: Role[] = [P, 'foreignAdmin'];
const ORG1_MEMBERS: Role[] = [
  P,
  'orgAdmin',
  'eventAdmin',
  'eventAdminOther',
  'vendor',
  'vendorOther',
  'sponsor',
  'sponsorOther',
];
const ORG_STAFF: Role[] = [P, 'orgAdmin', 'eventAdmin', 'eventAdminOther'];
const EVENT_STAFF: Role[] = [P, 'orgAdmin', 'eventAdmin'];
const EDITORS: Role[] = ['orgAdmin', 'eventAdmin']; // write access for AFFN 2027 staff

const is = (column: string, value: string) => `${column} = '${value}'`;
const byId = (prefix: string) => ({
  own: is('id', row(prefix, 'own')),
  other: is('id', row(prefix, 'other')),
  foreign: is('id', row(prefix, 'foreign')),
});

/** Event-scoped vendor data: event staff and the vendor itself. */
const vendorEventRead = {
  own: [...EVENT_STAFF, 'vendor'] as Role[],
  other: [...EVENT_STAFF, 'vendorOther'] as Role[],
  foreign: FOREIGN,
};
/** Vendor business data (home organization): all organization staff and the vendor. */
const vendorOrgRead = {
  own: [...ORG_STAFF, 'vendor'] as Role[],
  other: [...ORG_STAFF, 'vendorOther'] as Role[],
  foreign: FOREIGN,
};
/** Sponsor data scoped to AFFN 2027. */
const sponsorEventRead = {
  own: [...EVENT_STAFF, 'sponsor'] as Role[],
  other: [...EVENT_STAFF, 'sponsorOther'] as Role[],
  foreign: FOREIGN,
};

const event1 = { organization_id: ORG1, event_id: EVENT1 };

export const MATRIX: TableSpec[] = [
  // Tenancy ------------------------------------------------------------------------------------
  {
    table: 'organizations',
    rows: { own: is('id', ORG1), foreign: is('id', ORG2) },
    read: { own: [...ORG1_MEMBERS, 'anon'], foreign: FOREIGN },
    insert: { allowed: [P], row: () => ({ name: 'New Festival', slug: 'new-festival' }) },
    update: { allowed: ['orgAdmin'], target: 'own', set: () => 'name = name' },
  },
  {
    table: 'platform_admins',
    pk: 'user_id',
    rows: { own: is('user_id', USERS.platformOwner) },
    read: { own: [P] },
  },
  {
    table: 'memberships',
    rows: {
      own: is('user_id', USERS.vendor),
      other: is('user_id', USERS.vendorOther),
      foreign: is('user_id', USERS.foreignAdmin),
    },
    read: {
      own: [P, 'orgAdmin', 'vendor'],
      other: [P, 'orgAdmin', 'vendorOther'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: ['orgAdmin'],
      row: () => ({ organization_id: ORG1, user_id: USERS.orgAdmin2, role: 'event_admin' }),
    },
    update: { allowed: ['orgAdmin'], target: 'own', set: () => 'created_at = created_at' },
    delete: { allowed: ['orgAdmin'], target: 'own' },
  },
  {
    table: 'event_admins',
    rows: {
      own: is('user_id', USERS.eventAdmin),
      other: is('user_id', USERS.eventAdminOther),
      foreign: is('user_id', USERS.foreignAdmin),
    },
    read: {
      own: [P, 'orgAdmin', 'eventAdmin'],
      other: [P, 'orgAdmin', 'eventAdminOther'],
      foreign: FOREIGN,
    },
    insert: { allowed: ['orgAdmin'], row: () => ({ ...event1, user_id: USERS.eventAdminOther }) },
    delete: { allowed: ['orgAdmin'], target: 'own' },
  },
  {
    table: 'invitations',
    rows: { own: is('id', row('8b000000', 'own')), foreign: is('id', row('8b000000', 'foreign')) },
    read: { own: [P, 'orgAdmin'], foreign: FOREIGN },
    insert: {
      allowed: ['orgAdmin'],
      row: (uid) => ({
        organization_id: ORG1,
        email: 'new-admin@affn.test',
        token_hash: 'c'.repeat(64),
        invited_by: uid,
      }),
    },
    update: {
      allowed: ['orgAdmin'],
      target: 'own',
      set: (uid) => `revoked_at = now(), revoked_by = ${uid ? `'${uid}'` : 'null'}`,
    },
  },
  {
    table: 'events',
    rows: { own: is('id', EVENT1), other: is('id', EVENT2), foreign: is('id', EVENT3) },
    read: { own: [...ORG1_MEMBERS, 'anon'], other: ORG1_MEMBERS, foreign: FOREIGN },
    insert: {
      allowed: ['orgAdmin'],
      row: () => ({ organization_id: ORG1, name: 'AFFN 2028', slug: 'affn-2028' }),
    },
    update: { allowed: ['orgAdmin'], target: 'own', set: () => 'description = description' },
  },
  {
    table: 'product_categories',
    rows: { own: is('id', CATEGORY1), foreign: is('organization_id', ORG2) },
    read: { own: [...ORG1_MEMBERS, 'anon'], foreign: FOREIGN },
    insert: {
      allowed: ['orgAdmin'],
      row: () => ({ organization_id: ORG1, slug: 'snacks', name_nb: 'Snacks', name_en: 'Snacks' }),
    },
    update: { allowed: ['orgAdmin'], target: 'own', set: () => 'sort_order = sort_order' },
  },

  // Vendors and applications ------------------------------------------------------------------
  {
    table: 'vendors',
    rows: { own: is('id', VENDOR(1)), other: is('id', VENDOR(2)), foreign: is('id', VENDOR(11)) },
    read: {
      own: [...vendorOrgRead.own, 'anon'],
      other: [...vendorOrgRead.other, 'anon'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: ['orgAdmin'],
      row: () => ({
        organization_id: ORG1,
        org_number: '900000001',
        legal_name: 'Ny Leverandør AS',
        display_name: 'Ny Leverandør',
        slug: 'ny-leverandor',
      }),
    },
    update: {
      allowed: ['vendor', 'orgAdmin'],
      target: 'own',
      set: () => 'display_name = display_name',
    },
  },
  {
    table: 'vendor_contacts',
    pk: 'vendor_id',
    rows: {
      own: is('vendor_id', VENDOR(1)),
      other: is('vendor_id', VENDOR(2)),
      foreign: is('vendor_id', VENDOR(11)),
    },
    read: vendorOrgRead,
    insert: {
      allowed: ['orgAdmin'],
      row: () => ({
        vendor_id: VENDOR(6),
        organization_id: ORG1,
        contact_name: 'Ny Kontakt',
        contact_email: 'ny@example.no',
      }),
    },
    update: {
      allowed: ['vendor', 'orgAdmin'],
      target: 'own',
      set: () => 'contact_phone = contact_phone',
    },
    delete: { allowed: ['orgAdmin'], target: 'own' },
  },
  {
    table: 'vendor_documents',
    rows: byId('42000000'),
    read: vendorOrgRead,
    insert: {
      allowed: ['vendor', 'orgAdmin'],
      row: () => ({
        organization_id: ORG1,
        vendor_id: VENDOR(1),
        document_type: 'insurance',
        storage_path: 'vendor-1/new.pdf',
        file_name: 'new.pdf',
      }),
    },
    update: {
      allowed: ['vendor', 'orgAdmin', 'eventAdmin', 'eventAdminOther'],
      target: 'own',
      set: () => 'file_name = file_name',
    },
    delete: { allowed: ['vendor', 'orgAdmin'], target: 'own' },
  },
  {
    table: 'event_vendors',
    rows: {
      own: is('id', EVENT_VENDOR(1)),
      other: is('id', EVENT_VENDOR(2)),
      foreign: is('id', EVENT_VENDOR(11)),
    },
    read: {
      own: [...vendorEventRead.own, 'anon'],
      other: [...vendorEventRead.other, 'anon'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: ['vendor', 'orgAdmin'],
      row: () => ({
        organization_id: ORG1,
        event_id: EVENT2,
        vendor_id: VENDOR(1),
        status: 'draft',
      }),
    },
    // Vendor 1's application is approved, so only event staff may change it.
    update: {
      allowed: EDITORS,
      target: 'own',
      set: () => 'application_notes = application_notes',
    },
  },
  {
    table: 'vendor_agreements',
    rows: byId('43000000'),
    read: vendorEventRead,
    insert: {
      allowed: ['vendor'],
      row: (uid) => ({
        ...event1,
        event_vendor_id: EVENT_VENDOR(1),
        vendor_id: VENDOR(1),
        terms_version: 'v2',
        commission_terms: '10 % + mva',
        stall_fee_terms: 'kr 2 500',
        settlement_terms: 'Etter festivalen',
        accepted_by: uid,
      }),
    },
  },
  {
    table: 'application_reviews',
    rows: byId('44000000'),
    read: vendorEventRead,
    insert: {
      allowed: EDITORS,
      row: (uid) => ({
        ...event1,
        event_vendor_id: EVENT_VENDOR(1),
        vendor_id: VENDOR(1),
        to_status: 'approved',
        note: 'Godkjent igjen.',
        actor_id: uid,
      }),
    },
  },
  {
    table: 'internal_notes',
    rows: { own: is('id', row('45000000', 'own')), foreign: is('id', row('45000000', 'foreign')) },
    read: { own: EVENT_STAFF, foreign: FOREIGN },
    insert: {
      allowed: EDITORS,
      row: (uid) => ({
        ...event1,
        event_vendor_id: EVENT_VENDOR(1),
        body: 'Notat',
        author_id: uid,
      }),
    },
    // Only the author deletes a note.
    delete: { allowed: ['eventAdmin'], target: 'own' },
  },

  // Stalls and catalogue -------------------------------------------------------------------------
  {
    table: 'stalls',
    rows: {
      own: is('id', STALL(1)),
      other: is('id', STALL(2)),
      foreign: is('id', STALL(11)),
      spare: is('id', STALL(10)),
    },
    read: {
      own: [...EVENT_STAFF, 'vendor'],
      other: [...EVENT_STAFF, 'vendorOther'],
      foreign: FOREIGN,
      spare: EVENT_STAFF,
    },
    insert: { allowed: EDITORS, row: () => ({ ...event1, number: 'C1' }) },
    update: { allowed: EDITORS, target: 'own', set: () => 'zone = zone' },
    delete: { allowed: EDITORS, target: 'spare' },
  },
  {
    table: 'stall_types',
    rows: {
      own: is('id', STALL_TYPE(1)),
      other: is('id', STALL_TYPE(20)),
      foreign: is('id', STALL_TYPE(11)),
      spare: is('id', STALL_TYPE(10)),
    },
    read: {
      own: [...ORG1_MEMBERS, 'anon'],
      other: ORG1_MEMBERS,
      foreign: FOREIGN,
      spare: [...ORG1_MEMBERS, 'anon'],
    },
    insert: {
      allowed: ['orgAdmin'],
      row: () => ({ ...event1, name_nb: 'Ny', name_en: 'New', size_label: '1 × 1 m', fee_ore: 1 }),
    },
    update: { allowed: ['orgAdmin'], target: 'own', set: () => 'fee_ore = fee_ore' },
    delete: { allowed: ['orgAdmin'], target: 'spare' },
  },
  {
    table: 'stall_assignments',
    rows: {
      own: is('event_vendor_id', EVENT_VENDOR(1)),
      other: is('event_vendor_id', EVENT_VENDOR(2)),
      foreign: is('event_vendor_id', EVENT_VENDOR(11)),
    },
    read: vendorEventRead,
    insert: {
      allowed: EDITORS,
      row: () => ({
        ...event1,
        stall_id: STALL(10),
        event_vendor_id: EVENT_VENDOR(3),
        vendor_id: VENDOR(3),
      }),
    },
    update: { allowed: EDITORS, target: 'own', set: () => 'assigned_at = assigned_at' },
    delete: { allowed: EDITORS, target: 'own' },
  },
  {
    table: 'products',
    rows: {
      own: is('id', PRODUCT(1)),
      other: is('id', PRODUCT(5)),
      foreign: is('id', PRODUCT(21)),
    },
    read: {
      own: [...vendorOrgRead.own, 'anon'],
      other: [...vendorOrgRead.other, 'anon'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: ['vendor', 'orgAdmin'],
      row: () => ({
        organization_id: ORG1,
        vendor_id: VENDOR(1),
        name: 'Chin chin',
        price_ore: 3000,
      }),
    },
    update: { allowed: ['vendor', 'orgAdmin'], target: 'own', set: () => 'price_ore = price_ore' },
  },
  {
    table: 'product_availability',
    rows: {
      own: is('product_id', PRODUCT(1)),
      other: is('product_id', PRODUCT(5)),
      foreign: is('product_id', PRODUCT(21)),
    },
    read: {
      own: [...vendorEventRead.own, 'anon'],
      other: [...vendorEventRead.other, 'anon'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: ['vendor', ...EDITORS],
      row: () => ({
        ...event1,
        event_vendor_id: EVENT_VENDOR(1),
        vendor_id: VENDOR(1),
        product_id: PRODUCT(30),
      }),
    },
    update: {
      allowed: ['vendor', ...EDITORS],
      target: 'own',
      set: () => 'is_available = is_available',
    },
    delete: { allowed: ['vendor', ...EDITORS], target: 'own' },
  },

  // Commerce ---------------------------------------------------------------------------------------
  {
    table: 'orders',
    rows: byId('90000000'),
    read: vendorEventRead,
    update: { allowed: ['vendor', ...EDITORS], target: 'own', set: () => `status = 'accepted'` },
  },
  { table: 'order_items', rows: byId('91000000'), read: vendorEventRead },
  { table: 'payments', rows: byId('92000000'), read: vendorEventRead },
  { table: 'refunds', rows: byId('93000000'), read: vendorEventRead },

  // Money ----------------------------------------------------------------------------------------
  {
    table: 'commission_rules',
    rows: {
      own: is('id', '70000000-0000-4000-8000-000000000002'),
      other: is('id', '70000000-0000-4000-8000-000000000003'),
      default: is('id', COMMISSION_DEFAULT),
      foreign: is('id', '70000000-0000-4000-8000-000000000011'),
    },
    read: {
      own: [...ORG_STAFF, 'vendor'],
      other: [...ORG_STAFF, 'vendorOther'],
      default: [...ORG_STAFF, 'vendor', 'vendorOther'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: ['orgAdmin'],
      row: (uid) => ({
        ...event1,
        scope: 'event',
        type: 'percentage',
        rate_bp: 1100,
        reason: 'Event rate',
        created_by: uid,
      }),
    },
  },
  {
    table: 'ledger_entries',
    rows: {
      own: is('transaction_id', '95000000-0000-4000-8000-000000000001'),
      other: is('transaction_id', '95000000-0000-4000-8000-000000000002'),
      foreign: is('transaction_id', '95000000-0000-4000-8000-000000000011'),
    },
    read: vendorEventRead,
  },
  {
    table: 'settlements',
    rows: {
      own: is('id', SETTLEMENT(1)),
      other: is('id', SETTLEMENT(2)),
      foreign: is('id', SETTLEMENT(11)),
    },
    read: vendorEventRead,
    insert: { allowed: EDITORS, row: () => ({ ...event1 }) },
    update: { allowed: EDITORS, target: 'own', set: () => 'notes = notes' },
  },
  {
    table: 'settlement_lines',
    rows: { ...byId('97000000'), spare: is('id', '97000000-0000-4000-8000-000000000003') },
    read: { ...vendorEventRead, spare: EVENT_STAFF },
    insert: {
      allowed: EDITORS,
      row: () => ({
        ...event1,
        settlement_id: SETTLEMENT(1),
        event_vendor_id: EVENT_VENDOR(3),
        vendor_id: VENDOR(3),
        gross_sales_ore: 1000,
        net_payout_ore: 1000,
      }),
    },
    update: { allowed: EDITORS, target: 'own', set: () => 'refunds_ore = refunds_ore' },
    // The own line has a payout (foreign key), so deletion is tested on a spare line.
    delete: { allowed: EDITORS, target: 'spare' },
  },
  {
    table: 'settlement_adjustments',
    rows: byId('98000000'),
    read: vendorEventRead,
    insert: {
      allowed: EDITORS,
      row: (uid) => ({
        ...event1,
        settlement_id: SETTLEMENT(1),
        vendor_id: VENDOR(1),
        amount_ore: 100,
        reason: 'Korrigering',
        created_by: uid,
      }),
    },
    // Approval: Organization Admin only, recorded as the approver (created by the Event Admin).
    update: {
      allowed: ['orgAdmin'],
      target: 'own',
      set: (uid) => `approved_by = ${uid ? `'${uid}'` : 'null'}, approved_at = now()`,
    },
    delete: { allowed: EDITORS, target: 'own' },
  },
  { table: 'payouts', rows: byId('99000000'), read: vendorEventRead },
  { table: 'invoices', rows: byId('a2000000'), read: vendorEventRead },
  {
    table: 'invoice_counters',
    pk: 'organization_id',
    rows: { own: is('organization_id', ORG1) },
    read: { own: [] },
  },
  {
    table: 'stall_fees',
    rows: byId('a0000000'),
    read: vendorEventRead,
    insert: {
      allowed: EDITORS,
      row: () => ({
        ...event1,
        event_vendor_id: EVENT_VENDOR(3),
        vendor_id: VENDOR(3),
        amount_ore: 250000,
        total_ore: 250000,
      }),
    },
    update: { allowed: EDITORS, target: 'own', set: () => 'due_at = due_at' },
  },
  { table: 'fee_payments', rows: byId('a1000000'), read: vendorEventRead },

  // Sponsors and engagement ----------------------------------------------------------------------
  {
    table: 'sponsors',
    rows: {
      own: is('id', SPONSOR(1)),
      other: is('id', SPONSOR(2)),
      foreign: is('id', SPONSOR(11)),
    },
    read: {
      own: [...ORG_STAFF, 'sponsor'],
      other: [...ORG_STAFF, 'sponsorOther'],
      foreign: FOREIGN,
    },
    insert: { allowed: ['orgAdmin'], row: () => ({ organization_id: ORG1, name: 'Ny Sponsor' }) },
    update: {
      allowed: ['sponsor', 'orgAdmin'],
      target: 'own',
      set: () => 'website_url = website_url',
    },
  },
  {
    table: 'sponsor_packages',
    rows: {
      own: is('id', PACKAGE(1)),
      other: is('id', PACKAGE(3)), // in the second event of organization 1
      foreign: is('id', PACKAGE(11)),
      spare: is('id', PACKAGE(4)),
    },
    read: {
      own: [...EVENT_STAFF, 'sponsor', 'sponsorOther'],
      other: [P, 'orgAdmin', 'eventAdminOther', 'sponsor', 'sponsorOther'],
      foreign: FOREIGN,
      spare: [...EVENT_STAFF, 'sponsor', 'sponsorOther'],
    },
    insert: {
      allowed: EDITORS,
      row: () => ({ ...event1, name: 'Platina', price_ore: 30000000 }),
    },
    update: { allowed: EDITORS, target: 'own', set: () => 'description = description' },
    delete: { allowed: EDITORS, target: 'spare' },
  },
  {
    table: 'sponsorships',
    rows: {
      own: is('id', SPONSORSHIP(1)),
      other: is('id', SPONSORSHIP(2)),
      foreign: is('id', SPONSORSHIP(11)),
    },
    read: sponsorEventRead,
    // Sponsor 1 asks to sponsor the second event: the sponsor itself, the Organization Admin and
    // that event's Event Admin may create it; AFFN 2027's Event Admin may not.
    insert: {
      allowed: ['sponsor', 'orgAdmin', 'eventAdminOther'],
      row: () => ({
        organization_id: ORG1,
        event_id: EVENT2,
        sponsor_id: SPONSOR(1),
        package_id: PACKAGE(3),
        status: 'inquiry',
      }),
    },
    update: { allowed: EDITORS, target: 'own', set: () => 'notes = notes' },
  },
  {
    table: 'sponsor_assets',
    rows: byId('84000000'),
    read: sponsorEventRead,
    insert: {
      allowed: ['sponsor', ...EDITORS],
      row: () => ({
        ...event1,
        sponsorship_id: SPONSORSHIP(1),
        sponsor_id: SPONSOR(1),
        kind: 'banner',
        storage_path: 'sponsor-1/banner.png',
        file_name: 'banner.png',
      }),
    },
    update: { allowed: ['sponsor', ...EDITORS], target: 'own', set: () => 'file_name = file_name' },
    delete: { allowed: ['sponsor', ...EDITORS], target: 'own' },
  },
  {
    table: 'tracked_links',
    rows: byId('83000000'), // own: sponsor 1's QR, other: vendor 2's QR
    read: {
      own: [...EVENT_STAFF, 'sponsor'],
      other: [...EVENT_STAFF, 'vendorOther'],
      foreign: FOREIGN,
    },
    insert: {
      allowed: EDITORS,
      row: () => ({
        ...event1,
        kind: 'link',
        slug: 'ny-lenke',
        target_url: 'https://affn.example',
      }),
    },
    delete: { allowed: EDITORS, target: 'own' },
  },
  {
    table: 'qr_scans',
    rows: byId('85000000'),
    read: {
      own: [...EVENT_STAFF, 'sponsor'],
      other: [...EVENT_STAFF, 'vendorOther'],
      foreign: FOREIGN,
    },
  },
  { table: 'page_views', rows: byId('86000000'), read: vendorOrgRead },
  {
    table: 'leads',
    rows: byId('87000000'),
    read: {
      own: [P, 'orgAdmin', 'vendor'],
      other: [P, 'orgAdmin', 'vendorOther'],
      foreign: FOREIGN,
    },
    update: { allowed: ['vendor'], target: 'own', set: () => `status = 'contacted'` },
    delete: { allowed: ['vendor', 'orgAdmin'], target: 'own' },
  },

  // Platform -------------------------------------------------------------------------------------
  {
    table: 'audit_log',
    rows: {
      own: is('organization_id', ORG1),
      platform: 'organization_id is null',
      foreign: is('organization_id', ORG2),
    },
    read: { own: [P, 'orgAdmin'], platform: [P], foreign: FOREIGN },
  },
  {
    table: 'notifications',
    rows: byId('88000000'),
    read: { own: ['vendor'], other: ['vendorOther'], foreign: ['foreignAdmin'] },
    update: { allowed: ['vendor'], target: 'own', set: () => 'read_at = now()' },
    delete: { allowed: ['vendor'], target: 'own' },
  },
  {
    table: 'psp_webhook_events',
    rows: {
      own: is('id', '89000000-0000-4000-8000-000000000001'),
      unmatched: is('id', '89000000-0000-4000-8000-000000000002'),
      foreign: is('id', '89000000-0000-4000-8000-000000000011'),
    },
    read: { own: [P, 'orgAdmin'], unmatched: [P], foreign: FOREIGN },
  },
  {
    table: 'psp_webhook_attempts',
    rows: {
      own: is('id', '8a000000-0000-4000-8000-000000000001'),
      unmatched: is('id', '8a000000-0000-4000-8000-000000000002'),
      foreign: is('id', '8a000000-0000-4000-8000-000000000011'),
    },
    read: { own: [P, 'orgAdmin'], unmatched: [P], foreign: FOREIGN },
  },
];
