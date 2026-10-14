import pg from 'pg';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Runs one SQL statement as the database owner (test setup and assertions only). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

export const AFFN_ORG = '10000000-0000-4000-8000-000000000001';
export const AFFN_2027 = '20000000-0000-4000-8000-000000000001';
