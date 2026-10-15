import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateCommission, proRataFeeReversal } from '../../src/lib/money/commission';
import { ore, roundHalfUp } from '../../src/lib/money/index';
import { asOwner, connect, disconnect } from './db';
import {
  COMMISSION_DEFAULT,
  EVENT1,
  EVENT_VENDOR,
  ORG1,
  PRODUCT,
  SETTLEMENT,
  USERS,
  VENDOR,
} from './ids';

beforeAll(connect);
afterAll(disconnect);

// Settlement engine (SET-01 … SET-05): batches snapshot ledger balances, blockers stop a batch,
// approval is four-eyes in the database, payouts are released, failed ones retried, and what is
// paid out equals the ledger to the øre.

const RATE = { type: 'percentage' as const, rateBp: 1000, fixedOre: null };
const pspFee = (gross: number) => Number(roundHalfUp(BigInt(gross) * 250n, 10_000n));

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

/** A paid order through checkout and the payment webhook, as the app does it. */
async function sell(
  c: pg.Client,
  eventVendor: number,
  cart: [number, number][],
  prices: Record<number, number>,
) {
  const gross = cart.reduce((sum, [p, q]) => sum + prices[p]! * q, 0);
  const fee = calculateCommission(ore(gross), RATE);
  const items = JSON.stringify(cart.map(([p, quantity]) => ({ product_id: PRODUCT(p), quantity })));
  const { rows } = await c.query<{ r: { order_id: string; payment_id: string } }>(
    `select public.create_order($1, $2::jsonb, $3, $4, $5, $6, null, null, 'nb', 'mock') as r`,
    [EVENT_VENDOR(eventVendor), items, gross, COMMISSION_DEFAULT, fee.commission, fee.mva],
  );
  const { order_id, payment_id } = rows[0]!.r;
  await c.query(`select public.attach_provider_payment($1, $2)`, [payment_id, `pay_${payment_id}`]);
  await c.query(`select public.record_order_payment('mock', $1, true, 'vipps', $2, $3, null, $4)`, [
    `pay_${payment_id}`,
    gross,
    fee.platformFee,
    pspFee(gross),
  ]);
  return { orderId: order_id, paymentId: payment_id, gross, fee: fee.platformFee };
}

async function refund(c: pg.Client, sale: Awaited<ReturnType<typeof sell>>, amount: number) {
  const reversal = proRataFeeReversal(ore(sale.fee), ore(sale.gross), ore(amount));
  const { rows } = await c.query<{ id: string }>(
    `insert into public.refunds (organization_id, event_id, payment_id, order_id, vendor_id, amount_ore,
            platform_fee_reversal_ore, reason)
     select organization_id, event_id, $2, id, vendor_id, $3, $4, 'test' from public.orders where id = $1
     returning id`,
    [sale.orderId, sale.paymentId, amount, reversal],
  );
  await c.query(`select public.record_order_refund($1, $2, true, $3)`, [
    rows[0]!.id,
    `re_${rows[0]!.id}`,
    reversal,
  ]);
}

const V1 = { 1: 18_500, 2: 15_500, 3: 6_000, 4: 4_500 };
const V2 = { 5: 17_500, 6: 7_500, 7: 16_500, 8: 4_500 };

/** Fresh state: the fixture batches are cancelled, sales for vendors 1 and 2. */
async function setup(c: pg.Client) {
  await c.query(`update public.settlements set status = 'cancelled' where event_id = $1`, [EVENT1]);
  const a = await sell(
    c,
    1,
    [
      [1, 2],
      [4, 1],
    ],
    V1,
  );
  await sell(c, 1, [[2, 1]], V1);
  await refund(c, a, 4_500);
  await sell(
    c,
    2,
    [
      [5, 1],
      [8, 2],
    ],
    V2,
  );
}

async function newBatch(c: pg.Client, vendors: string[] | null = null) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.settlements (organization_id, event_id, notes) values ($1, $2, 'test') returning id`,
    [ORG1, EVENT1],
  );
  const id = rows[0]!.id;
  await c.query(`select public.prepare_settlement_lines($1, $2)`, [id, vendors]);
  return id;
}

/** The vendor's vendor_payable balance in the ledger for the event (all postings). */
const ledgerBalance = async (c: pg.Client, vendor: string) =>
  Number(
    (
      await c.query(
        `select coalesce(sum(case when direction = 'credit' then amount_ore else -amount_ore end), 0) as b
           from public.ledger_entries where event_id = $1 and vendor_id = $2 and account = 'vendor_payable'`,
        [EVENT1, vendor],
      )
    ).rows[0].b,
  );

const lines = async (c: pg.Client, settlement: string) =>
  (
    await c.query(
      `select vendor_id, gross_sales_ore::int as gross, refunds_ore::int as refunds,
              commission_ore::int as commission, commission_mva_ore::int as mva,
              adjustments_ore::int as adjustments, net_payout_ore::int as net
         from public.settlement_lines where settlement_id = $1 order by vendor_id`,
      [settlement],
    )
  ).rows;

const setStatus = (c: pg.Client, id: string, status: string) =>
  failure(c, `update public.settlements set status = $2 where id = $1`, [id, status]);

/** Event Admin prepares, a second Organization Admin approves. */
async function prepareAndApprove(c: pg.Client, id: string) {
  expect(await as(c, USERS.eventAdmin, () => setStatus(c, id, 'prepared'))).toBeNull();
  expect(await as(c, USERS.orgAdmin, () => setStatus(c, id, 'approved'))).toBeNull();
}

async function release(c: pg.Client, id: string, outcome: (vendor: string) => 'paid' | 'failed') {
  const { rows } = await c.query<{ payout_id: string; vendor_id: string; attempt: number }>(
    `select * from public.begin_settlement_release($1)`,
    [id],
  );
  let status = '';
  for (const p of rows) {
    const result = outcome(p.vendor_id);
    const r = await c.query(`select public.record_payout($1, $2, $3, $4) as s`, [
      p.payout_id,
      `po_${p.payout_id}`,
      result,
      result === 'failed' ? 'account_restricted' : null,
    ]);
    status = r.rows[0].s;
  }
  return { payouts: rows, status };
}

describe('settlement snapshot (SET-01, SET-02)', () => {
  it('lines equal the vendors’ ledger balances to the øre', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      const result = await lines(c, id);
      expect(result.map((l) => l.vendor_id)).toEqual([VENDOR(1), VENDOR(2)]);
      for (const line of result) {
        expect(line.gross - line.refunds - line.commission - line.mva + line.adjustments).toBe(
          line.net,
        );
        expect(line.net).toBe(await ledgerBalance(c, line.vendor_id));
      }
      // Vendor 1: kr 415 + kr 155 sold, kr 45 refunded, 10 % + mva charged on the sales.
      const v1 = result[0]!;
      expect(v1.gross).toBe(18_500 + 41_500 + 15_500); // includes the fixture sale of kr 185
      expect(v1.commission).toBe(4_150 + 1_550);
      // The balance shows as "in settlement" once the batch is ready.
      expect(await as(c, USERS.eventAdmin, () => setStatus(c, id, 'prepared'))).toBeNull();
      const { rows } = await c.query(
        `select in_settlement_ore::int as s, pending_ore::int as p from public.vendor_balances($1) where vendor_id = $2`,
        [EVENT1, VENDOR(1)],
      );
      expect(rows[0]).toEqual({ s: v1.net, p: 0 });
    });
  });

  it('only staff of the event prepare lines; nobody writes lines directly', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const { rows } = await c.query<{ id: string }>(
        `insert into public.settlements (organization_id, event_id) values ($1, $2) returning id`,
        [ORG1, EVENT1],
      );
      expect(
        await as(c, USERS.vendor, () =>
          failure(c, `select public.prepare_settlement_lines($1, null)`, [rows[0]!.id]),
        ),
      ).toMatch(/forbidden/);
      expect(
        await as(c, USERS.eventAdmin, () =>
          failure(
            c,
            `update public.settlement_lines set net_payout_ore = 1 where settlement_id = $1`,
            [SETTLEMENT(1)],
          ),
        ),
      ).toMatch(/permission denied/);
    });
  });

  it('skips vendors already in another open batch and only takes movements after the last cut-off', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const first = await newBatch(c, [VENDOR(1)]);
      const second = await newBatch(c);
      expect((await lines(c, second)).map((l) => l.vendor_id)).toEqual([VENDOR(2)]);
      // Vendor 1 settled: a later sale lands in the next batch only.
      await prepareAndApprove(c, first);
      expect((await release(c, first, () => 'paid')).status).toBe('completed');
      await c.query(`update public.settlements set status = 'cancelled' where id = $1`, [second]);
      // Nothing new since vendor 1's cut-off: the next batch does not take it again. (A later
      // sale landing in the next batch needs real time to pass; the e2e test covers it.)
      const next = await newBatch(c);
      expect((await lines(c, next)).map((l) => l.vendor_id)).toEqual([VENDOR(2)]);
      expect(await ledgerBalance(c, VENDOR(1))).toBe(0);
    });
  });
});

describe('blockers (SET-02)', () => {
  const kinds = async (c: pg.Client, id: string) =>
    (await c.query(`select kind from public.settlement_blockers($1) order by kind`, [id])).rows.map(
      (r) => r.kind,
    );

  it('an open dispute, a payout account not enabled, a negative balance or unreconciled transactions block a batch', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      expect(await kinds(c, id)).toEqual([]);

      const { rows } = await c.query(
        `select provider_payment_id from public.payments where vendor_id = $1 and status = 'succeeded'
          and provider_payment_id like 'pay_%' limit 1`,
        [VENDOR(2)],
      );
      await c.query(
        `select public.record_dispute('mock', 'dp_open', $1, 2000, 'fraudulent', 'open')`,
        [rows[0].provider_payment_id],
      );
      await c.query(
        `update public.event_vendors set psp_account_status = 'restricted' where id = $1`,
        [EVENT_VENDOR(1)],
      );
      expect(await kinds(c, id)).toEqual(['dispute', 'payout_account']);
      expect(await as(c, USERS.eventAdmin, () => setStatus(c, id, 'prepared'))).toMatch(
        /settlement_blocked/,
      );

      // Fixed: the dispute is won and the account enabled again.
      await c.query(`select public.record_dispute('mock', 'dp_open', $1, 2000, null, 'won')`, [
        rows[0].provider_payment_id,
      ]);
      await c.query(
        `update public.event_vendors set psp_account_status = 'eligible' where id = $1`,
        [EVENT_VENDOR(1)],
      );
      expect(await kinds(c, id)).toEqual([]);

      // A debit adjustment larger than the balance makes it negative.
      await c.query(
        `insert into public.settlement_adjustments (organization_id, event_id, settlement_id, vendor_id,
                amount_ore, reason, created_by, approved_by, approved_at)
         values ($1, $2, $3, $4, -9999999, 'Skade', $5, $6, now())`,
        [ORG1, EVENT1, id, VENDOR(2), USERS.eventAdmin, USERS.orgAdmin],
      );
      await c.query(`select public.prepare_settlement_lines($1, null)`, [id]);
      expect(await kinds(c, id)).toEqual(['negative']);

      // Unreconciled transactions (filled in by Prompt 14).
      await c.query(
        `create or replace function private.unreconciled_count(p_event_id uuid) returns integer
           language sql stable set search_path = '' as $$ select 3 $$`,
      );
      expect(await kinds(c, id)).toContain('unreconciled');
    });
  });

  it('an empty batch cannot be prepared', async () => {
    await asOwner(async (c) => {
      await c.query(`update public.settlements set status = 'cancelled' where event_id = $1`, [
        EVENT1,
      ]);
      const { rows } = await c.query<{ id: string }>(
        `insert into public.settlements (organization_id, event_id) values ($1, $2) returning id`,
        [ORG1, EVENT1],
      );
      expect(await kinds(c, rows[0]!.id)).toEqual(['no_lines']);
    });
  });
});

describe('four-eyes approval (SET-02)', () => {
  it('the preparer can never approve, an Event Admin can never approve, MFA is required', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      expect(await as(c, USERS.orgAdmin, () => setStatus(c, id, 'prepared'))).toBeNull();
      // Same person: refused by the database (check constraint), not only the UI.
      expect(await as(c, USERS.orgAdmin, () => setStatus(c, id, 'approved'))).toMatch(
        /settlements_check|check constraint/,
      );
      expect(await as(c, USERS.eventAdmin, () => setStatus(c, id, 'approved'))).toMatch(
        /Only an Organization Admin/,
      );
      expect(await as(c, USERS.orgAdmin2, () => setStatus(c, id, 'approved'), 'aal1')).toMatch(
        /no rows|Only an Organization Admin/,
      );
      expect(await as(c, USERS.orgAdmin2, () => setStatus(c, id, 'approved'))).toBeNull();
      const { rows } = await c.query(
        `select prepared_by, approved_by from public.settlements where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ prepared_by: USERS.orgAdmin, approved_by: USERS.orgAdmin2 });
    });
  });
});

describe('adjustments (SET-05)', () => {
  it('need an Organization Admin other than the creator, and count once approved', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      const before = (await lines(c, id)).find((l) => l.vendor_id === VENDOR(1))!;
      const { rows } = await as(c, USERS.orgAdmin, () =>
        c.query<{ id: string }>(
          `insert into public.settlement_adjustments (organization_id, event_id, settlement_id, vendor_id,
                  amount_ore, reason, created_by)
           values ($1, $2, $3, $4, 5000, 'Strømbrudd', $5) returning id`,
          [ORG1, EVENT1, id, VENDOR(1), USERS.orgAdmin],
        ),
      );
      const approve = `update public.settlement_adjustments set approved_by = auth.uid(), approved_at = now() where id = $1`;
      expect(await as(c, USERS.eventAdmin, () => failure(c, approve, [rows[0]!.id]))).toBe(
        'no rows',
      );
      expect(await as(c, USERS.orgAdmin, () => failure(c, approve, [rows[0]!.id]))).toMatch(
        /check constraint/,
      );
      expect(await as(c, USERS.orgAdmin2, () => failure(c, approve, [rows[0]!.id]))).toBeNull();
      await c.query(`select public.prepare_settlement_lines($1, null)`, [id]);
      const after = (await lines(c, id)).find((l) => l.vendor_id === VENDOR(1))!;
      expect(after.adjustments).toBe(5000);
      expect(after.net).toBe(before.net + 5000);

      // Locked once the batch is ready for approval.
      expect(await as(c, USERS.eventAdmin, () => setStatus(c, id, 'prepared'))).toBeNull();
      expect(
        await as(c, USERS.eventAdmin, () =>
          failure(
            c,
            `insert into public.settlement_adjustments (organization_id, event_id, settlement_id, vendor_id,
                    amount_ore, reason, created_by) values ($1, $2, $3, $4, 100, 'Sen', $5)`,
            [ORG1, EVENT1, id, VENDOR(1), USERS.eventAdmin],
          ),
        ),
      ).toMatch(/not_draft/);
    });
  });
});

describe('release (SET-03)', () => {
  it('pays out, retries a failed payout, and leaves every settled ledger balance at zero', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const id = await newBatch(c);
      // A credit adjustment for vendor 2, approved by a second admin.
      await c.query(
        `insert into public.settlement_adjustments (organization_id, event_id, settlement_id, vendor_id,
                amount_ore, reason, created_by, approved_by, approved_at)
         values ($1, $2, $3, $4, 2500, 'Kompensasjon', $5, $6, now())`,
        [ORG1, EVENT1, id, VENDOR(2), USERS.eventAdmin, USERS.orgAdmin],
      );
      await c.query(`select public.prepare_settlement_lines($1, null)`, [id]);
      const settled = await lines(c, id);
      await prepareAndApprove(c, id);
      // Users cannot release; only server code can.
      expect(await as(c, USERS.orgAdmin, () => setStatus(c, id, 'releasing'))).toMatch(
        /released by the server/,
      );

      // First run: vendor 2's payout fails.
      const first = await release(c, id, (v) => (v === VENDOR(2) ? 'failed' : 'paid'));
      expect(first.payouts.map((p) => p.attempt)).toEqual([1, 1]);
      expect(first.status).toBe('completed_with_failures');
      expect(await ledgerBalance(c, VENDOR(1))).toBe(0);
      expect(await ledgerBalance(c, VENDOR(2))).toBe(
        settled.find((l) => l.vendor_id === VENDOR(2))!.net,
      );

      // Retry: only vendor 2, as attempt 2, and the batch completes.
      const retry = await release(c, id, () => 'paid');
      expect(retry.payouts.map((p) => [p.vendor_id, p.attempt])).toEqual([[VENDOR(2), 2]]);
      expect(retry.status).toBe('completed');

      // Paid out = settled = ledger, to the øre; nothing left in vendor payable.
      const { rows } = await c.query(
        `select l.vendor_id, l.net_payout_ore::int as net,
                (select sum(amount_ore)::int from public.payouts p
                  where p.settlement_line_id = l.id and p.status = 'paid') as paid
           from public.settlement_lines l where l.settlement_id = $1 order by l.vendor_id`,
        [id],
      );
      for (const r of rows) expect(r.paid).toBe(r.net);
      expect(await ledgerBalance(c, VENDOR(1))).toBe(0);
      expect(await ledgerBalance(c, VENDOR(2))).toBe(0);
      const balances = await c.query(
        `select vendor_id, paid_ore::int as paid, pending_ore::int as pending, in_settlement_ore::int as s
           from public.vendor_balances($1) where vendor_id in ($2, $3) order by vendor_id`,
        [EVENT1, VENDOR(1), VENDOR(2)],
      );
      expect(balances.rows.map((b) => [b.paid, b.pending, b.s])).toEqual(
        rows.map((r) => [r.net, 0, 0]),
      );
      // Every transaction still balances.
      const unbalanced = await c.query(
        `select transaction_id from public.ledger_entries group by transaction_id
         having sum(case when direction = 'debit' then amount_ore else -amount_ore end) <> 0`,
      );
      expect(unbalanced.rows).toEqual([]);
    });
  });

  it('is server-only and idempotent per payout', async () => {
    await asOwner(async (c) => {
      for (const fn of [
        'public.begin_settlement_release(uuid)',
        'public.record_payout(uuid, text, public.payout_status, text)',
        'public.record_dispute(public.payment_provider, text, text, bigint, text, public.dispute_status)',
      ]) {
        const { rows } = await c.query(
          `select has_function_privilege('authenticated', $1, 'execute') as auth`,
          [fn],
        );
        expect(rows[0].auth, fn).toBe(false);
      }
      await setup(c);
      const id = await newBatch(c, [VENDOR(1)]);
      await prepareAndApprove(c, id);
      const { payouts } = await release(c, id, () => 'paid');
      await c.query(`select public.record_payout($1, 'again', 'paid', null)`, [
        payouts[0]!.payout_id,
      ]);
      const { rows } = await c.query(
        `select count(*)::int as n from public.ledger_entries where payout_id = $1`,
        [payouts[0]!.payout_id],
      );
      expect(rows[0].n).toBe(2);
    });
  });
});

describe('disputes', () => {
  it('a lost dispute is taken back from the vendor in the next settlement', async () => {
    await asOwner(async (c) => {
      await setup(c);
      const { rows } = await c.query(
        `select provider_payment_id from public.payments where vendor_id = $1 and status = 'succeeded'
          and provider_payment_id like 'pay_%' limit 1`,
        [VENDOR(1)],
      );
      const before = await ledgerBalance(c, VENDOR(1));
      await c.query(
        `select public.record_dispute('mock', 'dp_lost', $1, 3000, 'not received', 'open')`,
        [rows[0].provider_payment_id],
      );
      await c.query(`select public.record_dispute('mock', 'dp_lost', $1, 3000, null, 'lost')`, [
        rows[0].provider_payment_id,
      ]);
      // Repeated webhook: posted once.
      await c.query(`select public.record_dispute('mock', 'dp_lost', $1, 3000, null, 'lost')`, [
        rows[0].provider_payment_id,
      ]);
      expect(await ledgerBalance(c, VENDOR(1))).toBe(before - 3000);
      const id = await newBatch(c, [VENDOR(1)]);
      const line = (await lines(c, id))[0]!;
      expect(line.net).toBe(before - 3000);
      expect(line.refunds).toBeGreaterThanOrEqual(3000);
    });
  });
});
