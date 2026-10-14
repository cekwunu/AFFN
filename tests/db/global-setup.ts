import { readFileSync } from 'node:fs';
import pg from 'pg';
import { DB_URL } from './db';

// Loads the RLS fixtures once, on a database freshly reset with `pnpm db:reset`.
export default async function setup() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select 1 from public.organizations where id = '10000000-0000-4000-8000-000000000002'`,
    );
    if (rows.length === 0) {
      const sql = readFileSync(new URL('./fixtures.sql', import.meta.url), 'utf8');
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
    }
  } finally {
    await client.end();
  }
}
