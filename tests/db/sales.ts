import type pg from 'pg';
import { expect } from 'vitest';
import { calculateCommission, proRataFeeReversal } from '../../src/lib/money/commission';
import { ore, roundHalfUp } from '../../src/lib/money/index';
import { COMMISSION_DEFAULT, EVENT1, EVENT_VENDOR, ORG1, PRODUCT, USERS } from './ids';

// Sales, refunds and settlement batches as the app makes them (settlement and document tests).

export const RATE = { type: 'percentage' as const, rateBp: 1000, fixedOre: null };
export const pspFee = (gross: number) => Number(roundHalfUp(BigInt(gross) * 250n, 10_000n));

export async function as<T>(
  c: pg.Client,
  uid: string,
  fn: () => Promise<T>,
  aal = 'aal2',
): Promise<T> {
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

export const failure = (c: pg.Client, sql: string, params: unknown[] = []) =>
  c
    .query('savepoint f')
    .then(() => c.query(sql, params))
    .then(
      async (r) => (await c.query('release savepoint f'), r.rowCount === 0 ? 'no rows' : null),
      async (e: { message: string }) => (await c.query('rollback to savepoint f'), e.message),
    );

/** A paid order through checkout and the payment webhook, as the app does it. */
export async function sell(
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

export async function refund(c: pg.Client, sale: Awaited<ReturnType<typeof sell>>, amount: number) {
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

export const V1 = { 1: 18_500, 2: 15_500, 3: 6_000, 4: 4_500 };
export const V2 = { 5: 17_500, 6: 7_500, 7: 16_500, 8: 4_500 };

/** Fresh state: the fixture batches are cancelled, sales for vendors 1 and 2. */
export async function setup(c: pg.Client) {
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

export async function newBatch(c: pg.Client, vendors: string[] | null = null) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.settlements (organization_id, event_id, notes) values ($1, $2, 'test') returning id`,
    [ORG1, EVENT1],
  );
  const id = rows[0]!.id;
  await c.query(`select public.prepare_settlement_lines($1, $2)`, [id, vendors]);
  return id;
}

/** The vendor's vendor_payable balance in the ledger for the event (all postings). */
export const ledgerBalance = async (c: pg.Client, vendor: string) =>
  Number(
    (
      await c.query(
        `select coalesce(sum(case when direction = 'credit' then amount_ore else -amount_ore end), 0) as b
           from public.ledger_entries where event_id = $1 and vendor_id = $2 and account = 'vendor_payable'`,
        [EVENT1, vendor],
      )
    ).rows[0].b,
  );

export const lines = async (c: pg.Client, settlement: string) =>
  (
    await c.query(
      `select vendor_id, gross_sales_ore::int as gross, refunds_ore::int as refunds,
              commission_ore::int as commission, commission_mva_ore::int as mva,
              adjustments_ore::int as adjustments, net_payout_ore::int as net
         from public.settlement_lines where settlement_id = $1 order by vendor_id`,
      [settlement],
    )
  ).rows;

export const setStatus = (c: pg.Client, id: string, status: string) =>
  failure(c, `update public.settlements set status = $2 where id = $1`, [id, status]);

/** Event Admin prepares, a second Organization Admin approves. */
export async function prepareAndApprove(c: pg.Client, id: string) {
  expect(await as(c, USERS.eventAdmin, () => setStatus(c, id, 'prepared'))).toBeNull();
  expect(await as(c, USERS.orgAdmin, () => setStatus(c, id, 'approved'))).toBeNull();
}

export async function release(
  c: pg.Client,
  id: string,
  outcome: (vendor: string) => 'paid' | 'failed',
) {
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
