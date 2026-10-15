import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, asRole, attempt, connect, disconnect, ROLES, userId, type Role } from './db';
import { MATRIX, type TableSpec } from './matrix';

beforeAll(connect);
afterAll(disconnect);

function insertSql(spec: TableSpec, values: Record<string, unknown>) {
  const columns = Object.keys(values);
  if (columns.length === 0)
    return { sql: `insert into public.${spec.table} default values`, params: [] };
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  return {
    sql: `insert into public.${spec.table} (${columns.join(', ')}) values (${placeholders})`,
    params: Object.values(values),
  };
}

const firstLabel = (spec: TableSpec) => Object.keys(spec.rows)[0]!;

describe('the matrix covers the schema', () => {
  it('has exactly one entry per table in public, and every table has RLS enabled', async () => {
    const tables = await asOwner(
      async (c) =>
        (
          await c.query<{ tablename: string; rowsecurity: boolean }>(
            `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1`,
          )
        ).rows,
    );
    expect(tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)).toEqual([]);
    expect(MATRIX.map((s) => s.table).sort()).toEqual(tables.map((t) => t.tablename));
  });

  it.each(MATRIX.map((s) => [s.table, s] as const))('%s fixtures exist', async (_, spec) => {
    for (const [label, predicate] of Object.entries(spec.rows)) {
      const { rows } = await asOwner((c) =>
        c.query(`select count(*)::int as n from public.${spec.table} where ${predicate}`),
      );
      expect(rows[0].n, `${spec.table}.${label}`).toBeGreaterThan(0);
    }
  });
});

for (const spec of MATRIX) {
  describe(spec.table, () => {
    it.each(ROLES)('read as %s', async (role: Role) => {
      const visible: Record<string, boolean> = {};
      const expected: Record<string, boolean> = {};
      await asRole(role, async (c) => {
        for (const [label, predicate] of Object.entries(spec.rows)) {
          const ok = await attempt(c, `select 1 from public.${spec.table} where ${predicate}`);
          visible[label] = ok === 'allowed';
          expected[label] = (spec.read[label] ?? []).includes(role);
        }
      });
      expect(visible).toEqual(expected);
    });

    it.each(ROLES)('insert as %s', async (role: Role) => {
      const values = spec.insert?.row(userId(role)) ?? {};
      const { sql, params } = insertSql(spec, values);
      const outcome = await asRole(role, (c) => attempt(c, sql, params));
      expect(outcome).toBe(spec.insert?.allowed.includes(role) ? 'allowed' : 'denied');
    });

    it.each(ROLES)('update as %s', async (role: Role) => {
      const target = spec.update?.target ?? firstLabel(spec);
      const pk = spec.pk ?? 'id';
      const set = spec.update?.set(userId(role)) ?? `${pk} = ${pk}`;
      const outcome = await asRole(role, (c) =>
        attempt(c, `update public.${spec.table} set ${set} where ${spec.rows[target]}`),
      );
      expect(outcome).toBe(spec.update?.allowed.includes(role) ? 'allowed' : 'denied');
    });

    it.each(ROLES)('delete as %s', async (role: Role) => {
      const target = spec.delete?.target ?? firstLabel(spec);
      const outcome = await asRole(role, (c) =>
        attempt(c, `delete from public.${spec.table} where ${spec.rows[target]}`),
      );
      expect(outcome).toBe(spec.delete?.allowed.includes(role) ? 'allowed' : 'denied');
    });
  });
}
