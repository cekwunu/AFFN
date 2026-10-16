import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, connect, disconnect } from './db';
import { EVENT1, ORG1, PACKAGE, SPONSOR, SPONSORSHIP, USERS } from './ids';
import { as, failure } from './sales';

beforeAll(connect);
afterAll(disconnect);

// Sponsors (SPO-01 … SPO-04): registration after the Brønnøysund check, approval creates the
// deliverables, QR codes, tracked link and a numbered invoice; bank payment is marked by an
// Organization Admin; scans are counted without personal data.

const NEW_USER = '00000000-0000-4000-8000-000000000099';

async function pendingSponsorUser(c: pg.Client) {
  await c.query(
    `insert into auth.users (id, aud, role, email, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', 'ny@sponsor.test', '{}')`,
    [NEW_USER],
  );
  await c.query(
    `insert into public.memberships (organization_id, user_id, role, status) values ($1, $2, 'sponsor', 'pending')`,
    [ORG1, NEW_USER],
  );
}

const register = (c: pg.Client, user = NEW_USER) =>
  c.query<{ id: string }>(
    `select public.register_sponsor($1, $2, '923456783', 'SOLSKINN AS', 'Solskinn', 'https://solskinn.example',
       'Kari Nordmann', 'kari@solskinn.example', '', 'faktura@solskinn.example', 'Postboks 1, 0101 Oslo', 'PO-17') as id`,
    [user, PACKAGE(1)],
  );

describe('registration (SPO-01)', () => {
  it('creates the sponsor, activates the pending membership and an inquiry for the package', async () => {
    await asOwner(async (c) => {
      await pendingSponsorUser(c);
      const { rows } = await register(c);
      const { rows: s } = await c.query(
        `select sp.status, sp.package_id, sp.event_id, s.name, s.legal_name, s.org_number,
                s.brreg_verified_at is not null as verified, m.status as membership
           from public.sponsorships sp
           join public.sponsors s on s.id = sp.sponsor_id
           join public.memberships m on m.sponsor_id = s.id and m.user_id = $2
          where sp.id = $1`,
        [rows[0]!.id, NEW_USER],
      );
      expect(s[0]).toEqual({
        status: 'inquiry',
        package_id: PACKAGE(1),
        event_id: EVENT1,
        name: 'Solskinn',
        legal_name: 'SOLSKINN AS',
        org_number: '923456783',
        verified: true,
        membership: 'active',
      });
    });
  });

  it('needs a pending sponsor sign-up and is server code only', async () => {
    await asOwner(async (c) => {
      expect(await failure(c, await registerSql(), [USERS.vendor, PACKAGE(1)])).toMatch(
        /No sponsor sign-up/,
      );
      await pendingSponsorUser(c);
      expect(
        await as(c, NEW_USER, () => failure(c, registerSqlText, [NEW_USER, PACKAGE(1)])),
      ).toMatch(/permission denied/);
    });
  });
});

const registerSqlText = `select public.register_sponsor($1, $2, '923456783', 'X AS', 'X', '', 'K', 'k@x.no', '', 'f@x.no', '', '')`;
const registerSql = async () => registerSqlText;

/** Sponsorship 2 back to a fresh inquiry (the fixtures give it a deliverable and an invoice). */
async function fresh(c: pg.Client) {
  await c.query(`delete from public.sponsor_invoices where sponsorship_id = $1`, [SPONSORSHIP(2)]);
  await c.query(`delete from public.sponsorship_deliverables where sponsorship_id = $1`, [
    SPONSORSHIP(2),
  ]);
}

const review = (
  c: pg.Client,
  approve: boolean,
  note: string | null = 'Velkommen',
  price: number | null = null,
) =>
  failure(c, `select public.review_sponsorship($1, $2, $3, $4)`, [
    SPONSORSHIP(2),
    approve,
    note,
    price,
  ]);

describe('approval (SPO-01, SPO-03)', () => {
  it('confirms: deliverables, QR codes and a link, an invoice with the event mva and the next number', async () => {
    await asOwner(async (c) => {
      await fresh(c);
      await c.query(`update public.sponsor_packages set qr_code_count = 2 where id = $1`, [
        PACKAGE(2),
      ]);
      const { rows: counter } = await c.query(
        `select last_number::int as n from public.invoice_counters where organization_id = $1`,
        [ORG1],
      );
      expect(
        await as(c, USERS.eventAdmin, () => review(c, true, 'Velkommen som partner')),
      ).toBeNull();
      const { rows: sp } = await c.query(
        `select status, agreed_price_ore::int as price from public.sponsorships where id = $1`,
        [SPONSORSHIP(2)],
      );
      expect(sp[0]).toEqual({ status: 'invoiced', price: 5_000_000 });
      const { rows: deliverables } = await c.query(
        `select position, title, status from public.sponsorship_deliverables where sponsorship_id = $1 order by position`,
        [SPONSORSHIP(2)],
      );
      expect(deliverables).toEqual([
        { position: 1, title: 'Logo på nettsiden', status: 'pending' },
        { position: 2, title: 'Rapport etter festivalen', status: 'pending' },
      ]);
      const { rows: links } = await c.query(
        `select kind, target_url from public.tracked_links where sponsorship_id = $1 order by kind, label`,
        [SPONSORSHIP(2)],
      );
      expect(links.map((l) => l.kind)).toEqual(['qr', 'qr', 'link']);
      expect(links[0].target_url).toBe('https://fjordmobil.example');
      const { rows: invoice } = await c.query(
        `select invoice_number::int as n, subtotal_ore::int as net, mva_ore::int as mva, total_ore::int as total,
                mva_rate_bp, status, due_at > now() as due
           from public.sponsor_invoices where sponsorship_id = $1`,
        [SPONSORSHIP(2)],
      );
      expect(invoice[0]).toEqual({
        n: counter[0].n + 1,
        net: 5_000_000,
        mva: 1_250_000,
        total: 6_250_000,
        mva_rate_bp: 2500,
        status: 'issued',
        due: true,
      });
      const { rows: audit } = await c.query(
        `select reason, new_data ->> 'status' as status from public.audit_log
          where table_name = 'sponsorships' and row_id = $1 and action = 'update'`,
        [SPONSORSHIP(2)],
      );
      expect(audit).toContainEqual({ reason: 'Velkommen som partner', status: 'invoiced' });
      // Once decided, it cannot be decided again.
      expect(await as(c, USERS.eventAdmin, () => review(c, true))).toMatch(/not_inquiry/);
    });
  });

  it('declines with a note; an agreed price and the event mva rate are used when set', async () => {
    await asOwner(async (c) => {
      await fresh(c);
      expect(await as(c, USERS.eventAdmin, () => review(c, false, 'Ikke i år'))).toBeNull();
      const { rows } = await c.query(
        `select status, notes from public.sponsorships where id = $1`,
        [SPONSORSHIP(2)],
      );
      expect(rows[0]).toEqual({ status: 'cancelled', notes: 'Ikke i år' });
    });
    await asOwner(async (c) => {
      await fresh(c);
      await c.query(`update public.events set sponsor_mva_bp = 1500 where id = $1`, [EVENT1]);
      expect(
        await as(c, USERS.orgAdmin, () => review(c, true, 'Avtalt pris', 4_000_000)),
      ).toBeNull();
      const { rows } = await c.query(
        `select subtotal_ore::int as net, mva_ore::int as mva, mva_rate_bp from public.sponsor_invoices where sponsorship_id = $1`,
        [SPONSORSHIP(2)],
      );
      expect(rows[0]).toEqual({ net: 4_000_000, mva: 600_000, mva_rate_bp: 1500 });
    });
  });

  it('only event staff decide, and a note is required', async () => {
    await asOwner(async (c) => {
      expect(await as(c, USERS.sponsorOther, () => review(c, true))).toMatch(/forbidden/);
      expect(await as(c, USERS.eventAdminOther, () => review(c, true))).toMatch(/forbidden/);
      expect(await as(c, USERS.eventAdmin, () => review(c, true, ' '))).toMatch(/note is required/);
    });
  });
});

describe('bank payment', () => {
  it('an Organization Admin marks the invoice paid; an Event Admin cannot', async () => {
    await asOwner(async (c) => {
      const invoice = 'a9000000-0000-4000-8000-000000000001';
      const pay = () => failure(c, `select public.mark_sponsor_invoice_paid($1)`, [invoice]);
      expect(await as(c, USERS.eventAdmin, pay)).toMatch(/forbidden/);
      expect(await as(c, USERS.orgAdmin, pay)).toBeNull();
      const { rows } = await c.query(
        `select i.status, i.paid_at is not null as paid, i.paid_marked_by, s.status as sponsorship
           from public.sponsor_invoices i join public.sponsorships s on s.id = i.sponsorship_id
          where i.id = $1`,
        [invoice],
      );
      expect(rows[0]).toEqual({
        status: 'paid',
        paid: true,
        paid_marked_by: USERS.orgAdmin,
        sponsorship: 'paid',
      });
      expect(await as(c, USERS.orgAdmin, pay)).toMatch(/not_open/);
    });
  });
});

describe('scans and clicks (SPO-03)', () => {
  it('records time and a coarse device type only, and returns the target', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query(
        `select public.record_link_hit('nordlys-inngang', 'mobile') as target,
                public.record_link_hit('nordlys-inngang', 'iPhone 15') as again,
                public.record_link_hit('finnes-ikke', 'mobile') as missing`,
      );
      expect(rows[0]).toEqual({
        target: 'https://nordlysbank.example/affn',
        again: 'https://nordlysbank.example/affn',
        missing: null,
      });
      const { rows: scans } = await c.query(
        `select device_class from public.qr_scans q join public.tracked_links l on l.id = q.tracked_link_id
          where l.slug = 'nordlys-inngang' order by scanned_at, device_class`,
      );
      expect(scans.map((s) => s.device_class)).toContain('other');
      // No column could hold personal data.
      const { rows: columns } = await c.query(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'qr_scans' order by 1`,
      );
      expect(columns.map((r) => r.column_name)).toEqual([
        'device_class',
        'event_id',
        'id',
        'organization_id',
        'scanned_at',
        'tracked_link_id',
      ]);
      expect(
        await as(c, SPONSOR(1), () =>
          failure(c, `select public.record_link_hit('nordlys-inngang', 'mobile')`),
        ),
      ).toMatch(/permission denied/);
    });
  });
});
