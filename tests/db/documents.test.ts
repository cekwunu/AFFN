import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB_URL, asOwner, connect, disconnect } from './db';
import { EVENT1, ORG1, USERS, VENDOR } from './ids';
import { as, failure, lines, newBatch, prepareAndApprove, setup } from './sales';

beforeAll(connect);
afterAll(disconnect);

// Documents (SET-04): commission invoices equal the ledger, invoice numbers stay gapless when
// many are issued at once, and stored documents never change.

const STALL_FEE = 'a0000000-0000-4000-8000-000000000001';

/** Net commission and mva the ledger posted for the invoice's vendor in its period. */
async function ledgerCommission(c: pg.Client, invoiceVendor: string, settlement: string) {
  const { rows } = await c.query(
    `select coalesce(sum(case when e.direction = 'credit' then e.amount_ore else -e.amount_ore end)
                     filter (where e.account = 'commission_revenue'), 0)::int as commission,
            coalesce(sum(case when e.direction = 'credit' then e.amount_ore else -e.amount_ore end)
                     filter (where e.account = 'mva_payable'), 0)::int as mva
       from public.invoices i
       join public.ledger_entries e
         on e.event_id = i.event_id and e.vendor_id = i.vendor_id
        and e.created_at > coalesce(i.period_from, '-infinity') and e.created_at <= i.period_to
      where i.settlement_id = $1 and i.vendor_id = $2 and i.kind = 'commission'`,
    [settlement, invoiceVendor],
  );
  return rows[0] as { commission: number; mva: number };
}

describe('commission invoices (SET-04)', () => {
  it('one per vendor, settled by deduction, totals equal the ledger to the øre', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      await prepareAndApprove(c, id);
      const { rows: issued } = await c.query(`select public.issue_commission_invoices($1) as n`, [
        id,
      ]);
      expect(issued[0].n).toBe(2);
      // Idempotent: a second call issues nothing.
      const again = await c.query(`select public.issue_commission_invoices($1) as n`, [id]);
      expect(again.rows[0].n).toBe(0);

      const { rows: invoices } = await c.query(
        `select vendor_id, subtotal_ore::int as subtotal, mva_ore::int as mva, total_ore::int as total,
                status, settled_by_deduction, period_from, period_to, lines
           from public.invoices where settlement_id = $1 and kind = 'commission' order by vendor_id`,
        [id],
      );
      expect(invoices.map((i) => i.vendor_id)).toEqual([VENDOR(1), VENDOR(2)]);
      const settled = await lines(c, id);
      for (const invoice of invoices) {
        const ledger = await ledgerCommission(c, invoice.vendor_id, id);
        expect([invoice.subtotal, invoice.mva]).toEqual([ledger.commission, ledger.mva]);
        expect(invoice.total).toBe(invoice.subtotal + invoice.mva);
        expect(invoice).toMatchObject({ status: 'paid', settled_by_deduction: true });
        // The printed lines add up to the invoice.
        const sum = (key: 'amount_ore' | 'mva_ore') =>
          (invoice.lines as Record<string, number>[]).reduce((s, l) => s + l[key]!, 0);
        expect([sum('amount_ore'), sum('mva_ore')]).toEqual([invoice.subtotal, invoice.mva]);
        // Charged commission is the statement's commission line.
        const line = settled.find((l) => l.vendor_id === invoice.vendor_id)!;
        expect(invoice.lines[0]).toMatchObject({
          key: 'commission',
          amount_ore: line.commission,
          mva_ore: line.mva,
        });
      }
      // Vendor 1 had a refund: the given-back commission is its own line.
      expect(invoices[0].lines[1]).toMatchObject({ key: 'commission_reversed' });
    });
  });

  it('only for approved batches, and only server code issues them', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      expect(await failure(c, `select public.issue_commission_invoices($1)`, [id])).toMatch(
        /not_approved/,
      );
      expect(
        await as(c, USERS.orgAdmin, () =>
          failure(c, `select public.issue_commission_invoices($1)`, [id]),
        ),
      ).toMatch(/permission denied/);
    });
  });
});

describe('gapless invoice numbers', () => {
  it('stay gapless when many invoices are issued at once, some rolled back', async () => {
    const tag = `gapless-${Date.now()}`;
    const clients = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const client = new pg.Client({ connectionString: DB_URL });
        await client.connect();
        return client;
      }),
    );
    const owner = clients[0]!;
    const { rows: start } = await owner.query(
      `select coalesce(max(invoice_number), 0)::int as n from public.invoices where organization_id = $1`,
      [ORG1],
    );
    try {
      // Every connection opens a transaction and issues an invoice at the same time; every third
      // one rolls back (a failed document run), the others commit.
      const results = await Promise.all(
        clients.map(async (client, i) => {
          await client.query('begin');
          const { rows } = await client.query(
            `insert into public.invoices (organization_id, event_id, kind, vendor_id, stall_fee_id,
                    subtotal_ore, total_ore, description)
             values ($1, $2, 'stall_fee', $3, $4, 100, 100, $5) returning invoice_number::int as n`,
            [ORG1, EVENT1, VENDOR(1), STALL_FEE, tag],
          );
          await client.query(i % 3 === 2 ? 'rollback' : 'commit');
          return rows[0].n as number;
        }),
      );
      expect(new Set(results).size).toBeLessThanOrEqual(results.length);
      const { rows } = await owner.query(
        `select invoice_number::int as n from public.invoices where description = $1 order by 1`,
        [tag],
      );
      const committed = rows.map((r) => r.n);
      expect(committed).toHaveLength(8);
      // Consecutive after the previous highest number: no holes left by the rollbacks.
      expect(committed).toEqual(committed.map((_, i) => start[0].n + 1 + i));
      // And the whole organization's series has no holes.
      const { rows: series } = await owner.query(
        `select count(*)::int as count, max(invoice_number)::int as max from public.invoices
          where organization_id = $1`,
        [ORG1],
      );
      expect(series[0].count).toBe(series[0].max);
    } finally {
      // Put the database back as it was (owner connection; the counter follows).
      await owner.query(`delete from public.invoices where description = $1`, [tag]);
      await owner.query(
        `update public.invoice_counters set last_number = $2 where organization_id = $1`,
        [ORG1, start[0].n],
      );
      await Promise.all(clients.map((client) => client.end()));
    }
  });
});

describe('stored documents', () => {
  const insert = `insert into public.documents (organization_id, event_id, kind, subject_key, locale,
      version, vendor_id, storage_path, content_type, byte_size, sha256)
    values ($1, $2, 'vendor_statement', 'test', 'nb', 1, $3, 'test/v1.pdf', 'application/pdf', 10, $4)
    returning id`;

  it('are never changed or deleted, and only server code writes them', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query(insert, [ORG1, EVENT1, VENDOR(1), 'a'.repeat(64)]);
      const id = rows[0].id;
      expect(
        await failure(c, `update public.documents set version = 2 where id = $1`, [id]),
      ).toMatch(/append-only|not allowed|cannot/i);
      expect(await failure(c, `delete from public.documents where id = $1`, [id])).toMatch(
        /append-only|not allowed|cannot/i,
      );
      // A regeneration is a new version, not an overwrite.
      expect(await failure(c, insert, [ORG1, EVENT1, VENDOR(1), 'b'.repeat(64)])).toMatch(
        /duplicate key/,
      );
      expect(
        await as(c, USERS.orgAdmin, () =>
          failure(c, insert.replace('test/v1.pdf', 'test/v9.pdf'), [
            ORG1,
            EVENT1,
            VENDOR(1),
            'c'.repeat(64),
          ]),
        ),
      ).toMatch(/permission denied/);
    });
  });
});
