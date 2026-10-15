// Shared helpers for tests that need vendors with applications (P05, P06, P07).
import type pg from 'pg';
import { EVENT1, STALL_TYPE } from './ids';

/** Runs a statement and returns its SQLSTATE, or null when it succeeds (keeps the transaction). */
export async function errorCode(c: pg.Client, sql: string, params: unknown[] = []) {
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

export async function become(c: pg.Client, uid: string) {
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
export async function startApplication(c: pg.Client, category = 'hot-food') {
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

export const acceptAgreement = (
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

/**
 * A complete, submitted application (stall type Standard, agreement, Mattilsynet document),
 * created as the database owner. Returns the ids.
 */
export async function submittedApplication(c: pg.Client, category = 'hot-food') {
  const ids = await startApplication(c, category);
  await c.query(`update public.event_vendors set stall_type_id = $2 where id = $1`, [
    ids.eventVendorId,
    STALL_TYPE(1),
  ]);
  await acceptAgreement(c, ids);
  await c.query(
    `insert into public.vendor_documents (organization_id, vendor_id, document_type, storage_path, file_name, expires_on, uploaded_by)
     select organization_id, id, 'mattilsynet_registration', id || '/m.pdf', 'm.pdf', '2028-01-01', $2
       from public.vendors where id = $1`,
    [ids.vendorId, ids.uid],
  );
  await c.query(`update public.event_vendors set status = 'submitted' where id = $1`, [
    ids.eventVendorId,
  ]);
  return ids;
}
