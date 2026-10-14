import { NEW_PASSWORD, uniqueEmail } from './auth';
import { AFFN_2027, sql } from './db';

const STANDARD_STALL_TYPE = '52000000-0000-4000-8000-000000000001';

/** A fresh, valid (modulus-11) org number. */
export function newOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = `9${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
    const rest = [...base].reduce((sum, d, i) => sum + Number(d) * weights[i]!, 0) % 11;
    const check = rest === 0 ? 0 : 11 - rest;
    if (check !== 10) return `${base}${check}`;
  }
}

export interface Applicant {
  userId: string;
  email: string;
  password: string;
  vendorId: string;
  eventVendorId: string;
  name: string;
}

/**
 * Seeds a vendor user with a complete, submitted application for AFFN 2027 (Standard stall,
 * agreement accepted, Mattilsynet document), the way the application flow leaves it. Each call
 * creates a new vendor, so tests can run again without a database reset.
 */
export async function submittedApplicant(label: string): Promise<Applicant> {
  const email = uniqueEmail(label);
  const name = `Testkjøkken ${label} ${Math.random().toString(36).slice(2, 6)}`;
  const [user] = await sql<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
       'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       '{"signup_role":"vendor","organization_slug":"affn","locale":"nb"}', now(), now(),
       '', '', '', '')
     returning id`,
    [email, NEW_PASSWORD],
  );
  const userId = user!.id;
  await sql(
    `insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid, $3, 'email',
       jsonb_build_object('sub', $3::text, 'email', $2::text, 'email_verified', true), now(), now(), now())`,
    [userId, email, userId],
  );
  const [started] = await sql<{ id: string }>(
    `select public.start_vendor_application($1, $2, $3, $4, $5, 'AS', 'Testveien 1', '0155', 'Oslo', 'active') as id`,
    [userId, AFFN_2027, newOrgNumber(), `${name.toUpperCase()} AS`, name],
  );
  const eventVendorId = started!.id;
  const [ev] = await sql<{ vendor_id: string; organization_id: string }>(
    `select vendor_id, organization_id from public.event_vendors where id = $1`,
    [eventVendorId],
  );
  const vendorId = ev!.vendor_id;

  await sql(
    `update public.vendors set category = 'hot-food', cuisine_country = 'NG',
       description = 'Jollof og suya laget fra bunnen av.' where id = $1`,
    [vendorId],
  );
  await sql(
    `insert into public.vendor_contacts (vendor_id, organization_id, contact_name, contact_email, contact_phone)
     values ($1, $2, 'Test Person', $3, '+47 400 00 001')`,
    [vendorId, ev!.organization_id, email],
  );
  await sql(
    `update public.event_vendors set stall_type_id = $2, needs_power = true,
       application_progress = '{"completed":["business","contact","profile","stall"]}' where id = $1`,
    [eventVendorId, STANDARD_STALL_TYPE],
  );
  await sql(
    `insert into public.vendor_agreements (organization_id, event_id, event_vendor_id, vendor_id,
       terms_version, commission_terms, stall_fee_terms, settlement_terms, accepted_by)
     select organization_id, event_id, id, vendor_id, '2027.1-draft', '10 % + mva',
            'Standard (3 × 3 m): kr 2 500,00', 'Etter festivalen', $2
       from public.event_vendors where id = $1`,
    [eventVendorId, userId],
  );
  await sql(
    `insert into public.vendor_documents (organization_id, vendor_id, document_type, storage_path, file_name, expires_on, uploaded_by)
     values ($2, $1, 'mattilsynet_registration', $4, 'mattilsynet.pdf', '2028-12-31', $3)`,
    [vendorId, ev!.organization_id, userId, `${vendorId}/mattilsynet.pdf`],
  );
  await sql(`update public.event_vendors set status = 'submitted' where id = $1`, [eventVendorId]);
  return { userId, email, password: NEW_PASSWORD, vendorId, eventVendorId, name };
}
