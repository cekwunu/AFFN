import pg from 'pg';
import { USERS } from './ids';

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const ROLES = [
  'anon',
  'platformOwner',
  'orgAdmin',
  'eventAdmin',
  'eventAdminOther',
  'vendor',
  'vendorOther',
  'sponsor',
  'sponsorOther',
  'foreignAdmin',
] as const;
export type Role = (typeof ROLES)[number];

export function userId(role: Role): string | null {
  return role === 'anon' ? null : USERS[role];
}

let client: pg.Client | undefined;

export async function connect() {
  client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

export async function disconnect() {
  await client?.end();
  client = undefined;
}

function db() {
  if (!client) throw new Error('Call connect() first');
  return client;
}

/**
 * Runs `fn` as the given role inside a transaction that is always rolled back, the way
 * PostgREST does it: `set local role` plus JWT claims for auth.uid().
 */
export async function asRole<T>(
  role: Role,
  fn: (c: pg.Client) => Promise<T>,
  { aal = 'aal2' }: { aal?: 'aal1' | 'aal2' } = {},
): Promise<T> {
  const c = db();
  await c.query('begin');
  try {
    const uid = userId(role);
    // Signed-in test users have passed MFA (aal2) unless a test asks for aal1.
    const claims = uid
      ? { sub: uid, role: 'authenticated', aud: 'authenticated', aal }
      : { role: 'anon' };
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return await fn(c);
  } finally {
    await c.query('rollback');
  }
}

/** Runs `fn` as the database owner (bypasses RLS, like the service role) and rolls back. */
export async function asOwner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = db();
  await c.query('begin');
  try {
    return await fn(c);
  } finally {
    await c.query('rollback');
  }
}

export type Outcome = 'allowed' | 'denied';

/** Executes a write and classifies it: denied = permission error (42501) or no row affected. */
export async function attempt(c: pg.Client, sql: string, params: unknown[] = []): Promise<Outcome> {
  await c.query('savepoint attempt');
  try {
    const result = await c.query(sql, params);
    await c.query('release savepoint attempt');
    return (result.rowCount ?? 0) > 0 ? 'allowed' : 'denied';
  } catch (error) {
    await c.query('rollback to savepoint attempt');
    if ((error as { code?: string }).code === '42501') return 'denied';
    throw error;
  }
}
