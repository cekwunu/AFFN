import fc from 'fast-check';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateCommission, proRataFeeReversal } from '../../src/lib/money/commission';
import { ore, roundHalfUp } from '../../src/lib/money/index';
import {
  NOTHING_REVERSED,
  refundLines,
  saleLines,
  type LedgerLine,
  type PaidOrder,
  type Reversed,
} from '../../src/lib/money/ledger';
import { asOwner, asRole, connect, disconnect } from './db';
import { EVENT1, EVENT_VENDOR, ORG1, PRODUCT, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

// The ledger in the database (PRD §5–6, COM-02) posts exactly what src/lib/money/ledger.ts
// specifies, for random baskets, commission rules and refund sequences.

const PRICES = { 1: 18_500, 2: 15_500, 3: 6_000, 4: 4_500 } as const; // vendor 1's products
const pspFee = (gross: number) => Number(roundHalfUp(BigInt(gross) * 250n, 10_000n));

type Rule = {
  type: 'percentage' | 'fixed' | 'hybrid';
  rateBp: number | null;
  fixedOre: number | null;
};

async function addRule(c: pg.Client, rule: Rule) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.commission_rules (organization_id, scope, vendor_id, type, rate_bp, fixed_ore,
            effective_from, reason, created_by)
     values ($1, 'vendor', $2, $3, $4, $5, now(), 'test', $6) returning id`,
    [ORG1, VENDOR(1), rule.type, rule.rateBp, rule.fixedOre, USERS.orgAdmin],
  );
  return rows[0]!.id;
}

/** Checkout + successful payment webhook, as the app does it; returns the paid order. */
async function payOrder(c: pg.Client, cart: [number, number][], rule: Rule, ruleId: string) {
  const gross = cart.reduce((sum, [p, q]) => sum + PRICES[p as 1] * q, 0);
  const fee = calculateCommission(ore(gross), rule);
  const items = JSON.stringify(cart.map(([p, quantity]) => ({ product_id: PRODUCT(p), quantity })));
  const { rows } = await c.query<{ r: { order_id: string; payment_id: string } }>(
    `select public.create_order($1, $2::jsonb, $3, $4, $5, $6, null, null, 'nb', 'mock') as r`,
    [EVENT_VENDOR(1), items, gross, ruleId, fee.commission, fee.mva],
  );
  const { order_id, payment_id } = rows[0]!.r;
  const providerId = `pay_${payment_id}`;
  await c.query(`select public.attach_provider_payment($1, $2)`, [payment_id, providerId]);
  await c.query(`select public.record_order_payment('mock', $1, true, 'vipps', $2, $3, null, $4)`, [
    providerId,
    gross,
    fee.platformFee,
    pspFee(gross),
  ]);
  const order: PaidOrder = {
    grossOre: gross,
    commissionOre: fee.commission,
    commissionMvaOre: fee.mva,
    pspFeeOre: pspFee(gross),
  };
  return { orderId: order_id, paymentId: payment_id, order };
}

async function refund(
  c: pg.Client,
  orderId: string,
  paymentId: string,
  amount: number,
  feeReversal: number,
) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.refunds (organization_id, event_id, payment_id, order_id, vendor_id,
            amount_ore, platform_fee_reversal_ore, reason)
     select organization_id, event_id, $2, id, vendor_id, $3, $4, 'test'
       from public.orders where id = $1 returning id`,
    [orderId, paymentId, amount, feeReversal],
  );
  await c.query(`select public.record_order_refund($1, $2, true, $3)`, [
    rows[0]!.id,
    `re_${rows[0]!.id}`,
    feeReversal,
  ]);
  return rows[0]!.id;
}

const ledgerLines = async (c: pg.Client, column: 'payment_id' | 'refund_id', id: string) => {
  const { rows } = await c.query<LedgerLine & { tx: string }>(
    `select entry_type as "entryType", account, direction, amount_ore::int as "amountOre",
            transaction_id as tx
       from public.ledger_entries where ${column} = $1`,
    [id],
  );
  return rows;
};

const sortLines = (lines: LedgerLine[]) =>
  lines
    .map(({ entryType, account, direction, amountOre }) => ({
      entryType,
      account,
      direction,
      amountOre,
    }))
    .sort((a, b) => `${a.entryType}${a.account}`.localeCompare(`${b.entryType}${b.account}`));

const ruleArb = fc.oneof(
  fc.record({
    type: fc.constant('percentage' as const),
    rateBp: fc.integer({ min: 0, max: 3_000 }),
    fixedOre: fc.constant(null),
  }),
  fc.record({
    type: fc.constant('fixed' as const),
    rateBp: fc.constant(null),
    fixedOre: fc.integer({ min: 0, max: 3_000 }),
  }),
  fc.record({
    type: fc.constant('hybrid' as const),
    rateBp: fc.integer({ min: 0, max: 3_000 }),
    fixedOre: fc.integer({ min: 0, max: 3_000 }),
  }),
);
const cartArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 4 })
  .chain((products) =>
    fc.tuple(...products.map((p) => fc.tuple(fc.constant(p), fc.integer({ min: 1, max: 20 })))),
  );
const refundShareArb = fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 3 });

describe('ledger postings in the database', () => {
  it('match the TypeScript model for random orders, rules and refunds', async () => {
    const cases = fc.sample(fc.tuple(cartArb, ruleArb, refundShareArb, fc.boolean()), {
      numRuns: 150,
      seed: 11,
    });
    await asOwner(async (c) => {
      let checked = 0;
      for (const [cart, rule, shares, full] of cases) {
        const gross = cart.reduce((sum, [p, q]) => sum + PRICES[p as 1] * q, 0);
        try {
          calculateCommission(ore(gross), rule);
        } catch {
          continue; // fee larger than the sale: checkout refuses it
        }
        const ruleId = await addRule(c, rule);
        const { orderId, paymentId, order } = await payOrder(c, cart, rule, ruleId);

        const sale = await ledgerLines(c, 'payment_id', paymentId);
        const saleOnly = sale.filter(
          (l) => !['refund', 'refund_commission_reversal'].includes(l.entryType),
        );
        expect(sortLines(saleOnly)).toEqual(sortLines(saleLines(order)));
        expect(new Set(saleOnly.map((l) => l.tx)).size).toBe(1);

        // Refunds: shares of the gross (all of it when `full`), fee reversed as the mock does.
        const fee = order.commissionOre + order.commissionMvaOre;
        const total = shares.reduce((a, b) => a + b, 0);
        const target = full ? gross : Math.floor(gross / 3);
        const amounts = shares.map((s) => Math.floor((target * s) / Math.max(total, 1)));
        if (amounts.length)
          amounts[amounts.length - 1]! += target - amounts.reduce((a, b) => a + b, 0);
        let before: Reversed = NOTHING_REVERSED;
        let feeReversed = 0;
        for (const amount of amounts.filter((a) => a > 0)) {
          const last = before.refundedOre + amount === gross;
          const reversal = last
            ? fee - feeReversed
            : Math.min(proRataFeeReversal(ore(fee), ore(gross), ore(amount)), fee - feeReversed);
          const refundId = await refund(c, orderId, paymentId, amount, reversal);
          const expected = refundLines(order, before, amount, reversal);
          expect(sortLines(await ledgerLines(c, 'refund_id', refundId))).toEqual(
            sortLines(expected.lines),
          );
          before = expected.after;
          feeReversed += reversal;
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(100);

      // Every transaction balances (the deferred trigger also checks this at commit).
      const { rows } = await c.query(
        `select transaction_id from public.ledger_entries group by transaction_id
         having sum(case when direction = 'debit' then amount_ore else -amount_ore end) <> 0`,
      );
      expect(rows).toEqual([]);
    });
  });

  it('posts once, even if the payment webhook is repeated', async () => {
    await asOwner(async (c) => {
      const rule = { type: 'percentage' as const, rateBp: 1000, fixedOre: null };
      const { paymentId } = await payOrder(c, [[1, 1]], rule, await addRule(c, rule));
      await c.query(
        `select public.record_order_payment('mock', $1, true, 'vipps', 18500, 2313, null, 463)`,
        [`pay_${paymentId}`],
      );
      const { rows } = await c.query(
        `select count(distinct transaction_id)::int as n from public.ledger_entries where payment_id = $1`,
        [paymentId],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it('a later rate change does not alter past orders or their ledger lines', async () => {
    await asOwner(async (c) => {
      const rule = { type: 'percentage' as const, rateBp: 1000, fixedOre: null };
      const { orderId, paymentId } = await payOrder(c, [[1, 2]], rule, await addRule(c, rule));
      const snapshot = async () =>
        (
          await c.query(
            `select o.commission_rate_bp, o.commission_ore::int, o.commission_mva_ore::int,
                    (select json_agg(e order by e.account, e.direction) from (
                       select account, direction, amount_ore from public.ledger_entries
                        where payment_id = $2) e) as ledger
               from public.orders o where o.id = $1`,
            [orderId, paymentId],
          )
        ).rows[0];
      const before = await snapshot();
      await addRule(c, { type: 'hybrid', rateBp: 2500, fixedOre: 1_000 });
      expect(await snapshot()).toEqual(before);
    });
  });

  it('totals from the ledger equal totals from orders and refunds', async () => {
    await asOwner(async (c) => {
      const totals = async () => {
        const { rows } = await c.query(
          `select source, gross_ore::int as gross, refunded_ore::int as refunded,
                  platform_fee_ore::int as fee, psp_fee_ore::int as psp, vendor_ore::int as vendor
             from public.event_money_totals($1)`,
          [EVENT1],
        );
        return Object.fromEntries(rows.map(({ source, ...rest }) => [source, rest]));
      };
      // Fixture rows predate the ledger, so compare what this test adds on each side.
      const before = await totals();
      const rule = { type: 'hybrid' as const, rateBp: 1200, fixedOre: 300 };
      const ruleId = await addRule(c, rule);
      const a = await payOrder(
        c,
        [
          [1, 3],
          [4, 2],
        ],
        rule,
        ruleId,
      );
      const b = await payOrder(c, [[2, 1]], rule, ruleId);
      const feeA = a.order.commissionOre + a.order.commissionMvaOre;
      await refund(
        c,
        a.orderId,
        a.paymentId,
        10_000,
        proRataFeeReversal(ore(feeA), ore(a.order.grossOre), ore(10_000)),
      );
      await refund(
        c,
        b.orderId,
        b.paymentId,
        b.order.grossOre,
        b.order.commissionOre + b.order.commissionMvaOre,
      );
      const after = await totals();
      const delta = (source: string) =>
        Object.fromEntries(
          Object.entries(after[source]!).map(([k, v]) => [k, (v as number) - before[source]![k]]),
        );
      expect(delta('ledger')).toEqual(delta('orders'));
      expect(delta('ledger')).toMatchObject({
        gross: a.order.grossOre + b.order.grossOre,
        refunded: 10_000 + b.order.grossOre,
      });
    });
  });

  it('vendor balances come from the ledger and are visible to the vendor only', async () => {
    await asOwner(async (c) => {
      const balance = async () => {
        const { rows } = await c.query(
          `select vendor_id, lifetime_ore::int as lifetime, pending_ore::int as pending
             from public.vendor_balances($1)`,
          [EVENT1],
        );
        return rows;
      };
      const before = (await balance()).find((r) => r.vendor_id === VENDOR(1)) ?? {
        lifetime: 0,
        pending: 0,
      };
      const rule = { type: 'percentage' as const, rateBp: 1000, fixedOre: null };
      await payOrder(c, [[1, 2]], rule, await addRule(c, rule));
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({
          sub: USERS.vendor,
          role: 'authenticated',
          aud: 'authenticated',
          aal: 'aal2',
        }),
      ]);
      await c.query(`set local role authenticated`);
      const rows = await balance();
      // Only vendor 1's own balance; kr 370 − 10 % − mva (kr 46,25) = kr 323,75 more than before.
      expect(rows.map((r) => r.vendor_id)).toEqual([VENDOR(1)]);
      expect(rows[0].lifetime - before.lifetime).toBe(32_375);
      expect(rows[0].pending - before.pending).toBe(32_375);
    });
  });
});

describe('commission rules (COM-01, COM-03)', () => {
  const insert = (c: pg.Client, effective = 'now()', reason = 'Ny sats for 2027') =>
    c
      .query('savepoint s')
      .then(() =>
        c.query(
          `insert into public.commission_rules (organization_id, scope, event_id, type, rate_bp,
                  effective_from, reason, created_by)
           values ($1, 'event', $2, 'percentage', 1100, ${effective}, $3, auth.uid())`,
          [ORG1, EVENT1, reason],
        ),
      )
      .then(
        async () => (await c.query('release savepoint s'), null),
        async (e: { message: string }) => (await c.query('rollback to savepoint s'), e.message),
      );

  it('only Organization Admins add rules, with a reason, never back-dated', async () => {
    await asRole('orgAdmin', async (c) => {
      expect(await insert(c)).toBeNull();
      expect(await insert(c, "now() + interval '7 days'")).toBeNull();
      expect(await insert(c, "now() - interval '1 day'")).toMatch(/effective_from_past/);
      expect(await insert(c, 'now()', ' ')).toMatch(/violates check constraint/);
    });
    for (const role of ['eventAdmin', 'vendor', 'anon'] as const) {
      await asRole(role, async (c) => {
        expect(await insert(c), role).toMatch(/row-level security|permission denied/);
      });
    }
    await asRole('orgAdmin', async (c) => expect(await insert(c)).toMatch(/row-level security/), {
      aal: 'aal1',
    });
  });

  it('writes each new rule to the audit log with its reason', async () => {
    await asRole('orgAdmin', async (c) => {
      await insert(c, 'now()', 'Kampanje');
      await c.query('reset role');
      const { rows } = await c.query(
        `select actor_id, reason, action from public.audit_log
          where table_name = 'commission_rules' order by created_at desc limit 1`,
      );
      expect(rows[0]).toEqual({ actor_id: USERS.orgAdmin, reason: 'Kampanje', action: 'insert' });
    });
  });
});
