import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, attempt, connect, disconnect } from './db';
import { EVENT1, EVENT_VENDOR, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

async function errorCode(c: pg.Client, sql: string, params: unknown[] = []) {
  await c.query('savepoint probe');
  try {
    await c.query(sql, params);
    await c.query('release savepoint probe');
    return null;
  } catch (error) {
    await c.query('rollback to savepoint probe');
    return (error as { code?: string }).code ?? 'unknown';
  }
}

async function become(c: pg.Client, uid: string) {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated', aal: 'aal2' }),
  ]);
  await c.query('set local role authenticated');
}

let orgNumberSeq = 0;
const nextOrgNumber = () =>
  `98${String(Date.now() % 10_000_000).padStart(7, '0')}`.slice(0, 7) +
  String(10 + (orgNumberSeq++ % 90));

/** Signs up a vendor (pending membership) and starts an application; returns the ids. */
async function startApplication(c: pg.Client, category = 'hot-food') {
  const uid = crypto.randomUUID();
  await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
    [
      uid,
      `${uid}@apply.test`,
      JSON.stringify({ signup_role: 'vendor', organization_slug: 'affn' }),
    ],
  );
  const orgNumber = nextOrgNumber();
  const { rows } = await c.query<{ id: string }>(
    `select public.start_vendor_application($1, $2, $3, 'TEST MAT AS', 'Test Mat', 'AS',
       'Storgata 1', '0155', 'OSLO', 'active') as id`,
    [uid, EVENT1, orgNumber],
  );
  const eventVendorId = rows[0]!.id;
  const vendor = await c.query<{ vendor_id: string }>(
    `select vendor_id from public.event_vendors where id = $1`,
    [eventVendorId],
  );
  const vendorId = vendor.rows[0]!.vendor_id;
  await c.query(`update public.vendors set category = $2 where id = $1`, [vendorId, category]);
  return { uid, eventVendorId, vendorId, orgNumber };
}

const acceptAgreement = (
  c: pg.Client,
  ids: { uid: string; eventVendorId: string; vendorId: string },
) =>
  c.query(
    `insert into public.vendor_agreements (organization_id, event_id, event_vendor_id, vendor_id,
       terms_version, commission_terms, stall_fee_terms, settlement_terms, accepted_by)
     select organization_id, event_id, id, vendor_id, '2027.1-draft', '10 % + mva', 'kr 2 500,00',
            'After the festival', $2
       from public.event_vendors where id = $1`,
    [ids.eventVendorId, ids.uid],
  );

const submit = (id: string) =>
  `update public.event_vendors set status = 'submitted' where id = '${id}'`;

describe('starting an application (VEN-01, VEN-02)', () => {
  it('creates the business and a draft, and activates the vendor membership', async () => {
    await asOwner(async (c) => {
      const ids = await startApplication(c);
      const m = await c.query(
        `select status, vendor_id from public.memberships where user_id = $1 and role = 'vendor'`,
        [ids.uid],
      );
      expect(m.rows).toEqual([{ status: 'active', vendor_id: ids.vendorId }]);
      const ev = await c.query(
        `select status, application_progress from public.event_vendors where id = $1`,
        [ids.eventVendorId],
      );
      expect(ev.rows[0]).toEqual({
        status: 'draft',
        application_progress: { completed: ['business'] },
      });

      // The new vendor can now read its own draft under RLS.
      await become(c, ids.uid);
      const own = await c.query(`select id from public.event_vendors`);
      expect(own.rows.map((r) => r.id)).toEqual([ids.eventVendorId]);
    });
  });

  it('refuses an org number that is already registered', async () => {
    await asOwner(async (c) => {
      const first = await startApplication(c);
      const uid = crypto.randomUUID();
      await c.query(
        `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
        [
          uid,
          `${uid}@apply.test`,
          JSON.stringify({ signup_role: 'vendor', organization_slug: 'affn' }),
        ],
      );
      expect(
        await errorCode(
          c,
          `select public.start_vendor_application($1, $2, $3, 'X AS', 'X', 'AS', null, null, null, 'active')`,
          [uid, EVENT1, first.orgNumber],
        ),
      ).toBe('23505');
    });
  });

  it('needs a pending vendor sign-up', async () => {
    await asOwner(async (c) => {
      expect(
        await errorCode(
          c,
          `select public.start_vendor_application($1, $2, '999999999', 'X AS', 'X', 'AS', null, null, null, 'active')`,
          [USERS.eventAdmin, EVENT1],
        ),
      ).toBe('P0002');
    });
  });

  it('is server-only: signed-in users cannot call it or read the registry cache', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query(
        `select has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('service_role', p.oid, 'execute') as service
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('start_vendor_application', 'brreg_cache_get', 'brreg_cache_put')`,
      );
      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row).toEqual({ auth: false, anon: false, service: true });
    });
  });
});

describe('application status rules (VEN-04, VEN-05)', () => {
  it('a vendor submits only after accepting the agreement and uploading Mattilsynet proof', async () => {
    await asOwner(async (c) => {
      const ids = await startApplication(c, 'hot-food');
      await become(c, ids.uid);
      expect(await errorCode(c, submit(ids.eventVendorId))).toBe('23514');

      await acceptAgreement(c, ids);
      // Food vendor without Mattilsynet registration.
      expect(await errorCode(c, submit(ids.eventVendorId))).toBe('23514');

      await c.query(
        `insert into public.vendor_documents (organization_id, vendor_id, document_type, storage_path, file_name, expires_on, uploaded_by)
         select organization_id, id, 'mattilsynet_registration', id || '/m.pdf', 'm.pdf', '2028-01-01', $2
           from public.vendors where id = $1`,
        [ids.vendorId, ids.uid],
      );
      expect(await attempt(c, submit(ids.eventVendorId))).toBe('allowed');
      const after = await c.query(
        `select status, submitted_at is not null as stamped from public.event_vendors where id = $1`,
        [ids.eventVendorId],
      );
      expect(after.rows[0]).toEqual({ status: 'submitted', stamped: true });

      // Submitted applications are locked for the vendor.
      expect(
        await attempt(
          c,
          `update public.event_vendors set preferred_zone = 'Market' where id = '${ids.eventVendorId}'`,
        ),
      ).toBe('denied');
    });
  });

  it('a non-food vendor does not need Mattilsynet proof', async () => {
    await asOwner(async (c) => {
      const ids = await startApplication(c, 'fashion-crafts');
      await become(c, ids.uid);
      await acceptAgreement(c, ids);
      expect(await attempt(c, submit(ids.eventVendorId))).toBe('allowed');
    });
  });

  it('a vendor cannot move its application to any other status', async () => {
    await asOwner(async (c) => {
      const ids = await startApplication(c, 'fashion-crafts');
      await become(c, ids.uid);
      await acceptAgreement(c, ids);
      for (const status of ['under_review', 'approved', 'waitlisted']) {
        expect(
          await errorCode(
            c,
            `update public.event_vendors set status = '${status}' where id = '${ids.eventVendorId}'`,
          ),
        ).toBe('42501');
      }
    });
  });

  it('after "more info requested" the vendor can edit and resubmit', async () => {
    await asOwner(async (c) => {
      const ids = await startApplication(c, 'fashion-crafts');
      await become(c, ids.uid);
      await acceptAgreement(c, ids);
      await c.query(submit(ids.eventVendorId));

      await become(c, USERS.eventAdmin);
      await c.query(
        `update public.event_vendors set status = 'more_info_requested' where id = $1`,
        [ids.eventVendorId],
      );
      await c.query(
        `insert into public.application_reviews (organization_id, event_id, event_vendor_id, vendor_id, from_status, to_status, note, actor_id)
         select organization_id, event_id, id, vendor_id, 'submitted', 'more_info_requested', 'Please add a menu', $2
           from public.event_vendors where id = $1`,
        [ids.eventVendorId, USERS.eventAdmin],
      );

      await become(c, ids.uid);
      const note = await c.query(
        `select note from public.application_reviews where event_vendor_id = $1`,
        [ids.eventVendorId],
      );
      expect(note.rows).toEqual([{ note: 'Please add a menu' }]);
      expect(
        await attempt(
          c,
          `update public.event_vendors set preferred_zone = 'Market' where id = '${ids.eventVendorId}'`,
        ),
      ).toBe('allowed');
      expect(await attempt(c, submit(ids.eventVendorId))).toBe('allowed');
    });
  });

  it('staff cannot approve an application without an accepted agreement', async () => {
    await asOwner(async (c) => {
      await become(c, USERS.eventAdmin);
      // Seeded draft for vendor 4, no agreement.
      expect(
        await errorCode(
          c,
          `update public.event_vendors set status = 'approved' where id = '${EVENT_VENDOR(4)}'`,
        ),
      ).toBe('23514');
    });
  });

  it('agreement acceptances can never be changed or deleted', async () => {
    await asOwner(async (c) => {
      expect(
        await errorCode(c, `update public.vendor_agreements set terms_version = 'x'`),
      ).not.toBeNull();
      expect(await errorCode(c, `delete from public.vendor_agreements`)).not.toBeNull();
      const audited = await c.query(
        `select count(*)::int as n from public.audit_log where table_name = 'vendor_agreements'`,
      );
      const ids = await startApplication(c, 'other');
      await become(c, ids.uid);
      await acceptAgreement(c, ids);
      await c.query('reset role');
      const after = await c.query(
        `select count(*)::int as n from public.audit_log where table_name = 'vendor_agreements'`,
      );
      expect(after.rows[0].n).toBe(audited.rows[0].n + 1);
    });
  });
});

describe('vendor files in storage (VEN-03)', () => {
  const putObject = (bucket: string, name: string, owner: string) =>
    `insert into storage.objects (bucket_id, name, owner_id) values ('${bucket}', '${name}', '${owner}')`;

  it('vendors write only under their own folder; staff can read; others cannot', async () => {
    await asOwner(async (c) => {
      await become(c, USERS.vendor);
      const own = `${VENDOR(1)}/insurance.pdf`;
      expect(await attempt(c, putObject('vendor-documents', own, USERS.vendor))).toBe('allowed');
      expect(
        await attempt(c, putObject('vendor-documents', `${VENDOR(2)}/x.pdf`, USERS.vendor)),
      ).toBe('denied');
      expect(await attempt(c, putObject('vendor-documents', 'no-folder.pdf', USERS.vendor))).toBe(
        'denied',
      );
      expect(
        await attempt(c, putObject('vendor-media', `${VENDOR(1)}/logo.png`, USERS.vendor)),
      ).toBe('allowed');

      const visible = async () =>
        (await c.query(`select 1 from storage.objects where name = $1`, [own])).rowCount;
      expect(await visible()).toBe(1);
      await become(c, USERS.vendorOther);
      expect(await visible()).toBe(0);
      await become(c, USERS.eventAdmin);
      expect(await visible()).toBe(1);
      await become(c, USERS.foreignAdmin);
      expect(await visible()).toBe(0);
    });
  });
});
