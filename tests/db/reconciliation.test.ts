import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, connect, disconnect } from './db';
import { EVENT1, ORG1, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Reconciliation (TRX-02): runs store mismatches once per provider transaction, later runs
// resolve what no longer differs, open mismatches block settlement, and staff assign, comment
// and resolve them with a reason (audited).

async function as<T>(c: pg.Client, uid: string, fn: () => Promise<T>, aal = 'aal2'): Promise<T> {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated', aal }),
  ]);
  await c.query('set local role authenticated');
  try {
    return await fn();
  } finally {
    await c.query('reset role');
    await c.query(`select set_config('request.jwt.claims', '', true)`);
  }
}

const failure = (c: pg.Client, sql: string, params: unknown[] = []) =>
  c
    .query('savepoint f')
    .then(() => c.query(sql, params))
    .then(
      async (r) => (await c.query('release savepoint f'), r.rowCount === 0 ? 'no rows' : null),
      async (e: { message: string }) => (await c.query('rollback to savepoint f'), e.message),
    );

const FROM = '2027-06-01T00:00:00Z';
const TO = '2027-06-02T00:00:00Z';
const AT = '2027-06-01T12:00:00Z';

const item = (providerId: string, kind = 'amount_differs', eventId: string | null = EVENT1) => ({
  kind,
  transaction_kind: 'payment',
  provider_id: providerId,
  our_amount_ore: 10_000,
  their_amount_ore: 9_000,
  our_fee_ore: 1_250,
  their_fee_ore: 1_250,
  occurred_at: AT,
  event_id: eventId,
});

const run = async (c: pg.Client, items: ReturnType<typeof item>[], matched = 5) =>
  (
    await c.query<{ id: string }>(
      `select public.record_reconciliation($1, 'mock', $2, $3, $4, $5, $6::jsonb, null) as id`,
      [ORG1, FROM, TO, matched + items.length, matched, JSON.stringify(items)],
    )
  ).rows[0]!.id;

const open = async (c: pg.Client) =>
  (
    await c.query(
      `select provider_id, kind, status from public.reconciliation_items
        where organization_id = $1 and status <> 'resolved' order by provider_id`,
      [ORG1],
    )
  ).rows;

const newSettlement = async (c: pg.Client) => {
  await c.query(`update public.settlements set status = 'cancelled' where event_id = $1`, [EVENT1]);
  const { rows } = await c.query<{ id: string }>(
    `insert into public.settlements (organization_id, event_id, notes) values ($1, $2, 'test') returning id`,
    [ORG1, EVENT1],
  );
  return rows[0]!.id;
};
const blockers = async (c: pg.Client, id: string) =>
  (await c.query(`select kind, amount_ore::int as n from public.settlement_blockers($1)`, [id]))
    .rows;

describe('reconciliation runs', () => {
  it('a clean run stores the counts and no items', async () => {
    await asOwner(async (c) => {
      const id = await run(c, []);
      const { rows } = await c.query(
        `select provider_count, matched_count, mismatch_count from public.reconciliation_runs where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ provider_count: 5, matched_count: 5, mismatch_count: 0 });
      expect(await open(c)).toEqual([]);
    });
  });

  it('keeps one open item per mismatch and resolves those that no longer differ', async () => {
    await asOwner(async (c) => {
      await run(c, [item('pay_a'), item('pay_b', 'missing_ours', null)]);
      const second = await run(c, [item('pay_a')]);
      expect(await open(c)).toEqual([
        { provider_id: 'pay_a', kind: 'amount_differs', status: 'open' },
      ]);
      const { rows } = await c.query(
        `select provider_id, last_seen_run_id = $2 as seen, status, resolution_reason, resolved_at is not null as stamped
           from public.reconciliation_items where organization_id = $1 and provider_id in ('pay_a', 'pay_b')
          order by provider_id`,
        [ORG1, second],
      );
      expect(rows).toEqual([
        {
          provider_id: 'pay_a',
          seen: true,
          status: 'open',
          resolution_reason: null,
          stamped: false,
        },
        {
          provider_id: 'pay_b',
          seen: false,
          status: 'resolved',
          resolution_reason: 'No longer differs in a later reconciliation',
          stamped: true,
        },
      ]);
    });
  });

  it('only the service role stores runs', async () => {
    await asOwner(async (c) => {
      expect(
        await as(c, USERS.orgAdmin, () =>
          failure(
            c,
            `select public.record_reconciliation($1, 'mock', $2, $3, 0, 0, '[]'::jsonb, null)`,
            [ORG1, FROM, TO],
          ),
        ),
      ).toMatch(/permission denied/);
    });
  });
});

describe('unreconciled transactions block settlement (SET-02)', () => {
  it('open items for the event, or not placed in an event, block; resolved ones do not', async () => {
    await asOwner(async (c) => {
      const id = await newSettlement(c);
      expect((await blockers(c, id)).map((b) => b.kind)).not.toContain('unreconciled');

      await run(c, [item('pay_a'), item('pay_x', 'missing_ours', null)]);
      expect(await blockers(c, id)).toContainEqual({ kind: 'unreconciled', n: 2 });
      // Event staff see the same blocker (the count runs for them too).
      const asStaff = await as(c, USERS.eventAdmin, () => blockers(c, id));
      expect(asStaff).toContainEqual({ kind: 'unreconciled', n: 2 });

      await c.query(
        `update public.reconciliation_items set status = 'resolved', resolution_reason = 'Checked'
          where organization_id = $1 and status <> 'resolved'`,
        [ORG1],
      );
      expect((await blockers(c, id)).map((b) => b.kind)).not.toContain('unreconciled');
    });
  });
});

describe('mismatch workflow (TRX-02)', () => {
  const itemId = async (c: pg.Client) =>
    (
      await c.query<{ id: string }>(
        `select id from public.reconciliation_items where provider_id = 'pay_a' and status <> 'resolved'`,
      )
    ).rows[0]!.id;

  it('staff assign, comment and resolve with a reason; each step is audited', async () => {
    await asOwner(async (c) => {
      await run(c, [item('pay_a')]);
      const id = await itemId(c);
      await as(c, USERS.eventAdmin, async () => {
        expect(
          await failure(
            c,
            `update public.reconciliation_items set status = 'assigned', assigned_to = $2 where id = $1`,
            [id, USERS.orgAdmin],
          ),
        ).toBeNull();
        expect(
          await failure(
            c,
            `insert into public.reconciliation_comments (organization_id, item_id, author_id, body)
             values ($1, $2, $3, 'Spør PSP')`,
            [ORG1, id, USERS.eventAdmin],
          ),
        ).toBeNull();
        // Resolving needs a reason.
        expect(
          await failure(
            c,
            `update public.reconciliation_items set status = 'resolved' where id = $1`,
            [id],
          ),
        ).toMatch(/check constraint/);
      });
      await as(c, USERS.orgAdmin, async () => {
        expect(
          await failure(
            c,
            `update public.reconciliation_items set status = 'resolved', resolution_reason = 'PSP corrected the report'
              where id = $1`,
            [id],
          ),
        ).toBeNull();
      });
      const { rows } = await c.query(
        `select status, resolved_by, resolved_at is not null as stamped from public.reconciliation_items where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ status: 'resolved', resolved_by: USERS.orgAdmin, stamped: true });
      const audit = await c.query(
        `select actor_id, new_data ->> 'status' as status, reason from public.audit_log
          where table_name = 'reconciliation_items' and row_id = $1 and action = 'update'
          order by created_at, new_data ->> 'status' = 'resolved'`,
        [id],
      );
      expect(audit.rows).toEqual([
        { actor_id: USERS.eventAdmin, status: 'assigned', reason: null },
        { actor_id: USERS.orgAdmin, status: 'resolved', reason: 'PSP corrected the report' },
      ]);

      // Reopening clears the resolution.
      await as(c, USERS.orgAdmin, () =>
        c.query(`update public.reconciliation_items set status = 'open' where id = $1`, [id]),
      );
      const reopened = await c.query(
        `select resolution_reason, resolved_by from public.reconciliation_items where id = $1`,
        [id],
      );
      expect(reopened.rows[0]).toEqual({ resolution_reason: null, resolved_by: null });
    });
  });

  it('vendors and other organizations cannot see or change mismatches', async () => {
    await asOwner(async (c) => {
      await run(c, [item('pay_a')]);
      const id = await itemId(c);
      for (const user of [USERS.vendor, USERS.foreignAdmin]) {
        const seen = await as(c, user, () =>
          c.query(`select 1 from public.reconciliation_items where id = $1`, [id]),
        );
        expect(seen.rowCount).toBe(0);
        expect(
          await as(c, user, () =>
            failure(
              c,
              `update public.reconciliation_items set status = 'resolved', resolution_reason = 'x' where id = $1`,
              [id],
            ),
          ),
        ).toBe('no rows');
      }
      // Staff cannot comment in someone else's name.
      expect(
        await as(c, USERS.eventAdmin, () =>
          failure(
            c,
            `insert into public.reconciliation_comments (organization_id, item_id, author_id, body)
             values ($1, $2, $3, 'x')`,
            [ORG1, id, USERS.orgAdmin],
          ),
        ),
      ).toMatch(/row-level security/);
    });
  });
});

describe('transaction centre view (TRX-01)', () => {
  it('runs as the caller: a vendor sees only their own transactions', async () => {
    await asOwner(async (c) => {
      const all = await as(c, USERS.eventAdmin, () =>
        c.query(`select distinct vendor_id from public.transactions where event_id = $1`, [EVENT1]),
      );
      expect(all.rowCount).toBeGreaterThan(1);
      const own = await as(c, USERS.vendor, () =>
        c.query(`select distinct vendor_id from public.transactions`),
      );
      expect(own.rows.map((r) => r.vendor_id)).toEqual([VENDOR(1)]);
      const foreign = await as(c, USERS.foreignAdmin, () =>
        c.query(`select 1 from public.transactions where event_id = $1`, [EVENT1]),
      );
      expect(foreign.rowCount).toBe(0);
    });
  });
});
