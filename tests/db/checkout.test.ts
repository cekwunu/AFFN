import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorCode } from './applications';
import { asOwner, connect, disconnect } from './db';
import { COMMISSION_DEFAULT, EVENT1, EVENT_VENDOR, PRODUCT } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Checkout (QR-03, QR-04): create_order re-checks the cart, prices and commission.
// Vendor 1 sells products 1–4 (kr 185, 155, 60, 45, no mva) at 10 % + mva.

const items = (...pairs: [number, number][]) =>
  JSON.stringify(pairs.map(([n, quantity]) => ({ product_id: PRODUCT(n), quantity })));

const createOrder = (
  c: pg.Client,
  {
    cart = items([1, 2], [4, 1]),
    total = 41_500,
    commission = 4_150,
    mva = 1_038,
    rule = COMMISSION_DEFAULT,
  }: { cart?: string; total?: number; commission?: number; mva?: number; rule?: string } = {},
) =>
  c.query<{ result: Record<string, string | number> }>(
    `select public.create_order($1, $2::jsonb, $3, $4, $5, $6, ' Kari ', '', 'nb', 'mock') as result`,
    [EVENT_VENDOR(1), cart, total, rule, commission, mva],
  );

const failure = (c: pg.Client, sql: string, params: unknown[]) =>
  c
    .query('savepoint f')
    .then(() => c.query(sql, params))
    .then(
      async () => {
        await c.query('release savepoint f');
        return null;
      },
      async (error: { message: string }) => {
        await c.query('rollback to savepoint f');
        return error.message;
      },
    );

const attempt = (c: pg.Client, opts: Parameters<typeof createOrder>[1]) =>
  failure(
    c,
    `select public.create_order($1, $2::jsonb, $3, $4, $5, $6, null, null, 'nb', 'mock')`,
    [
      EVENT_VENDOR(1),
      opts?.cart ?? items([1, 2], [4, 1]),
      opts?.total ?? 41_500,
      opts?.rule ?? COMMISSION_DEFAULT,
      opts?.commission ?? 4_150,
      opts?.mva ?? 1_038,
    ],
  );

describe('create_order', () => {
  it('creates the order, its lines copied from the products and a pending payment', async () => {
    await asOwner(async (c) => {
      const { rows } = await createOrder(c);
      const result = rows[0]!.result;
      expect(result).toMatchObject({ total_ore: 41_500, mva_ore: 0, platform_fee_ore: 5_188 });
      expect(result.idempotency_key).toBe(`order-${result.order_id}`);

      const order = await c.query(
        `select status, customer_name, total_ore::int, commission_type, commission_rate_bp,
                commission_ore::int, commission_mva_ore::int, platform_fee_ore::int, order_number > 0 as numbered
           from public.orders where id = $1`,
        [result.order_id],
      );
      expect(order.rows[0]).toEqual({
        status: 'pending_payment',
        customer_name: 'Kari',
        total_ore: 41_500,
        commission_type: 'percentage',
        commission_rate_bp: 1000,
        commission_ore: 4_150,
        commission_mva_ore: 1_038,
        platform_fee_ore: 5_188,
        numbered: true,
      });
      const lines = await c.query(
        `select product_name, unit_price_ore::int, quantity, line_total_ore::int, mva_ore::int
           from public.order_items where order_id = $1 order by line_total_ore desc`,
        [result.order_id],
      );
      expect(lines.rows).toEqual([
        {
          product_name: 'Jollof-ris med kylling',
          unit_price_ore: 18_500,
          quantity: 2,
          line_total_ore: 37_000,
          mva_ore: 0,
        },
        {
          product_name: 'Zobo',
          unit_price_ore: 4_500,
          quantity: 1,
          line_total_ore: 4_500,
          mva_ore: 0,
        },
      ]);
      const payment = await c.query(
        `select status, amount_ore::int, platform_fee_ore::int from public.payments where id = $1`,
        [result.payment_id],
      );
      expect(payment.rows[0]).toEqual({
        status: 'pending',
        amount_ore: 41_500,
        platform_fee_ore: 5_188,
      });
    });
  });

  it('computes mva per line for mva-registered vendors', async () => {
    await asOwner(async (c) => {
      await c.query(
        `update public.vendors set mva_registered = true where id = (select vendor_id from public.event_vendors where id = $1)`,
        [EVENT_VENDOR(1)],
      );
      await c.query(`update public.products set mva_rate_bp = 1500 where id = $1`, [PRODUCT(2)]);
      // kr 155 × 3 = 465 incl. 15 % → 60,652… → 60,65.
      const { rows } = await createOrder(c, {
        cart: items([2, 3]),
        total: 46_500,
        commission: 4_650,
        mva: 1_163,
      });
      expect(rows[0]!.result).toMatchObject({ total_ore: 46_500, mva_ore: 6_065 });
    });
  });

  it('refuses stale prices, unavailable products and a wrong commission', async () => {
    await asOwner(async (c) => {
      expect(await attempt(c, { total: 41_000 })).toBe('price_changed');
      expect(await attempt(c, { commission: 4_000 })).toBe('commission_mismatch');
      expect(await attempt(c, { mva: 1_037 })).toBe('commission_mismatch');
      expect(await attempt(c, { cart: items([1, 0]), total: 0 })).toBe('unavailable');
      expect(await attempt(c, { cart: items([1, 21]), total: 388_500 })).toBe('unavailable');
      expect(await attempt(c, { cart: items([1, 1], [1, 1]), total: 37_000 })).toBe('unavailable');
      // Another vendor's product.
      expect(
        await attempt(c, { cart: items([5, 1]), total: 17_500, commission: 1_750, mva: 438 }),
      ).toBe('unavailable');
      expect(await attempt(c, { cart: '[]', total: 0, commission: 0, mva: 0 })).toBe(
        'invalid_cart',
      );

      await c.query(
        `update public.product_availability set is_available = false where product_id = $1`,
        [PRODUCT(4)],
      );
      expect(await attempt(c, {})).toBe('unavailable');
      await c.query(
        `update public.product_availability set is_available = true where product_id = $1`,
        [PRODUCT(4)],
      );
      await c.query(`update public.products set archived_at = now() where id = $1`, [PRODUCT(4)]);
      expect(await attempt(c, {})).toBe('unavailable');
    });
  });

  it('refuses orders while the vendor cannot sell (QR-04)', async () => {
    const blocked = [
      `update public.event_vendors set is_paused = true where id = '${EVENT_VENDOR(1)}'`,
      `update public.event_vendors set psp_account_status = 'restricted' where id = '${EVENT_VENDOR(1)}'`,
      `update public.event_vendors set is_published = false where id = '${EVENT_VENDOR(1)}'`,
      `update public.events set status = 'closed' where id = '${EVENT1}'`,
    ];
    for (const change of blocked) {
      await asOwner(async (c) => {
        await c.query(change);
        expect(await attempt(c, {}), change).toBe('not_selling');
      });
    }
  });

  it('is server-only, as are attach_provider_payment and set_receipt_email', async () => {
    await asOwner(async (c) => {
      for (const fn of [
        'public.create_order(uuid, jsonb, bigint, uuid, bigint, bigint, text, text, text, public.payment_provider)',
        'public.attach_provider_payment(uuid, text)',
        'public.set_receipt_email(text, text)',
      ]) {
        const { rows } = await c.query(
          `select has_function_privilege('authenticated', $1, 'execute') as auth,
                  has_function_privilege('anon', $1, 'execute') as anon`,
          [fn],
        );
        expect(rows[0], fn).toEqual({ auth: false, anon: false });
      }
    });
  });

  it('runs end to end with the payment webhook: paid order, receipt email kept', async () => {
    await asOwner(async (c) => {
      const { rows } = await createOrder(c);
      const r = rows[0]!.result;
      await c.query(`select public.attach_provider_payment($1, 'mock_pay_e2e')`, [r.payment_id]);
      // The id never changes once set.
      await c.query(`select public.attach_provider_payment($1, 'mock_pay_other')`, [r.payment_id]);
      expect(
        await errorCode(c, `select public.set_receipt_email($1, 'kari@example.no')`, [
          r.tracking_token,
        ]),
      ).toBeNull();
      const before = await c.query(`select customer_email from public.orders where id = $1`, [
        r.order_id,
      ]);
      expect(before.rows[0]!.customer_email).toBeNull(); // not before payment

      await c.query(
        `select public.record_order_payment('mock', 'mock_pay_e2e', true, 'card', 41500, 5188, null)`,
      );
      const { rows: ok } = await c.query(
        `select public.set_receipt_email($1, ' Kari@Example.no ') as ok`,
        [r.tracking_token],
      );
      expect(ok[0]!.ok).toBe(true);
      const after = await c.query(
        `select status, customer_email from public.orders where id = $1`,
        [r.order_id],
      );
      expect(after.rows[0]).toEqual({ status: 'new', customer_email: 'kari@example.no' });
    });
  });
});
