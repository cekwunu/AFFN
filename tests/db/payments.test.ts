import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorCode } from './applications';
import { asOwner, connect, disconnect } from './db';
import { EVENT1, EVENT_VENDOR, ORG1, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Payment layer (P09, VEN-06): server-only functions behind webhooks and checkout.

const SERVER_ONLY = [
  'public.set_payment_account(uuid, text, public.psp_account_status, uuid)',
  'public.set_payment_account_status(text, public.psp_account_status)',
  'public.record_order_payment(public.payment_provider, text, boolean, public.payment_method, bigint, bigint, text)',
  'public.record_refund_result(text, boolean)',
  'public.record_payout_result(text, boolean, text)',
];

/** A paid-to-be order of kr 500 at 10 % + mva, with its pending payment. */
async function pendingOrder(c: pg.Client) {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.orders (organization_id, event_id, event_vendor_id, vendor_id, total_ore,
       commission_type, commission_rate_bp, commission_ore, commission_mva_ore, platform_fee_ore)
     values ($1, $2, $3, $4, 50000, 'percentage', 1000, 5000, 1250, 6250) returning id`,
    [ORG1, EVENT1, EVENT_VENDOR(1), VENDOR(1)],
  );
  const orderId = rows[0]!.id;
  const providerPaymentId = `mock_pay_${crypto.randomUUID()}`;
  await c.query(
    `insert into public.payments (organization_id, event_id, order_id, vendor_id, provider,
       provider_payment_id, amount_ore, platform_fee_ore, idempotency_key)
     values ($1, $2, $3, $4, 'mock', $5, 50000, 6250, $6)`,
    [ORG1, EVENT1, orderId, VENDOR(1), providerPaymentId, `order-${orderId}`],
  );
  return { orderId, providerPaymentId };
}

const record = (c: pg.Client, id: string, succeeded: boolean, amount = 50000, fee = 6250) =>
  c.query(`select public.record_order_payment('mock', $1, $2, 'vipps', $3, $4, $5)`, [
    id,
    succeeded,
    amount,
    fee,
    succeeded ? null : 'card_declined',
  ]);

const orderState = async (c: pg.Client, orderId: string) =>
  (
    await c.query(
      `select o.status as order_status, o.paid_at is not null as paid, p.status as payment_status,
              p.method, p.failure_reason
         from public.orders o join public.payments p on p.order_id = o.id where o.id = $1`,
      [orderId],
    )
  ).rows[0];

describe('server-only payment functions', () => {
  it('only the service role may run them', async () => {
    await asOwner(async (c) => {
      for (const fn of SERVER_ONLY) {
        const { rows } = await c.query(
          `select has_function_privilege('authenticated', $1, 'execute') as auth,
                  has_function_privilege('anon', $1, 'execute') as anon,
                  has_function_privilege('service_role', $1, 'execute') as service`,
          [fn],
        );
        expect(rows[0], fn).toEqual({ auth: false, anon: false, service: true });
      }
    });
  });
});

describe('vendor payment account (VEN-06)', () => {
  it('links the account, moves not started → pending → enabled, and audits each step', async () => {
    await asOwner(async (c) => {
      await c.query(
        `update public.event_vendors set psp_account_id = null, psp_account_status = 'not_started'
          where id = $1`,
        [EVENT_VENDOR(1)],
      );
      await c.query(`select public.set_payment_account($1, 'mock_acct_1', 'pending', $2)`, [
        EVENT_VENDOR(1),
        USERS.vendor,
      ]);
      const { rows: updated } = await c.query(
        `select public.set_payment_account_status('mock_acct_1', 'eligible') as n`,
      );
      expect(updated[0]!.n).toBe(1);
      // Same status again changes nothing.
      const { rows: again } = await c.query(
        `select public.set_payment_account_status('mock_acct_1', 'eligible') as n`,
      );
      expect(again[0]!.n).toBe(0);

      const { rows } = await c.query(
        `select psp_account_id, psp_account_status from public.event_vendors where id = $1`,
        [EVENT_VENDOR(1)],
      );
      expect(rows[0]).toEqual({ psp_account_id: 'mock_acct_1', psp_account_status: 'eligible' });

      const audit = await c.query(
        `select actor_id, old_data ->> 'psp_account_status' as old, new_data ->> 'psp_account_status' as new
           from public.audit_log
          where table_name = 'event_vendors' and row_id = $1
            and old_data ->> 'psp_account_status' is distinct from new_data ->> 'psp_account_status'
          order by created_at, new_data ->> 'psp_account_status' = 'eligible'`,
        [EVENT_VENDOR(1)],
      );
      expect(audit.rows.slice(-2)).toEqual([
        { actor_id: USERS.vendor, old: 'not_started', new: 'pending' },
        { actor_id: null, old: 'pending', new: 'eligible' },
      ]);
    });
  });

  it('refuses a second, different account and participations that are not approved', async () => {
    await asOwner(async (c) => {
      await c.query(
        `update public.event_vendors set psp_account_id = 'mock_acct_a', psp_account_status = 'pending'
          where id = $1`,
        [EVENT_VENDOR(1)],
      );
      expect(
        await errorCode(
          c,
          `select public.set_payment_account($1, 'mock_acct_b', 'pending', null)`,
          [EVENT_VENDOR(1)],
        ),
      ).toBe('23514');
      // The same account again is fine (resuming onboarding).
      expect(
        await errorCode(
          c,
          `select public.set_payment_account($1, 'mock_acct_a', 'pending', null)`,
          [EVENT_VENDOR(1)],
        ),
      ).toBeNull();
      const { rows: other } = await c.query<{ id: string }>(
        `select id from public.event_vendors where status <> 'approved' limit 1`,
      );
      expect(
        await errorCode(
          c,
          `select public.set_payment_account($1, 'mock_acct_c', 'pending', null)`,
          [other[0]!.id],
        ),
      ).toBe('23514');
    });
  });
});

describe('order payments', () => {
  it('a success marks the payment succeeded and the order new (paid), once', async () => {
    await asOwner(async (c) => {
      const { orderId, providerPaymentId } = await pendingOrder(c);
      await record(c, providerPaymentId, true);
      expect(await orderState(c, orderId)).toEqual({
        order_status: 'new',
        paid: true,
        payment_status: 'succeeded',
        method: 'vipps',
        failure_reason: null,
      });
      // Repeats and a late failure change nothing.
      await record(c, providerPaymentId, true);
      await record(c, providerPaymentId, false);
      expect((await orderState(c, orderId))!.order_status).toBe('new');
      const audit = await c.query(
        `select count(*)::int as n from public.audit_log
          where table_name = 'payments' and new_data ->> 'order_id' = $1
            and new_data ->> 'status' = 'succeeded'`,
        [orderId],
      );
      expect(audit.rows[0]!.n).toBe(1);
    });
  });

  it('a failure marks the payment failed and the order cancelled', async () => {
    await asOwner(async (c) => {
      const { orderId, providerPaymentId } = await pendingOrder(c);
      await record(c, providerPaymentId, false);
      expect(await orderState(c, orderId)).toMatchObject({
        order_status: 'cancelled',
        paid: false,
        payment_status: 'failed',
        failure_reason: 'card_declined',
      });
    });
  });

  it('refuses amounts that differ from what checkout asked for, and unknown payments', async () => {
    await asOwner(async (c) => {
      const { providerPaymentId } = await pendingOrder(c);
      await c.query('savepoint s');
      await expect(record(c, providerPaymentId, true, 49999, 6250)).rejects.toMatchObject({
        code: '23514',
      });
      await c.query('rollback to savepoint s');
      await expect(record(c, providerPaymentId, true, 50000, 6000)).rejects.toMatchObject({
        code: '23514',
      });
      await c.query('rollback to savepoint s');
      await expect(record(c, 'mock_pay_unknown', true)).rejects.toMatchObject({ code: 'P0002' });
    });
  });
});

describe('refund and payout results', () => {
  it('report false for unknown provider ids', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query(
        `select public.record_refund_result('re_unknown', true) as refund,
                public.record_payout_result('po_unknown', true, null) as payout`,
      );
      expect(rows[0]).toEqual({ refund: false, payout: false });
    });
  });

  it('marks a pending refund succeeded', async () => {
    await asOwner(async (c) => {
      const { orderId, providerPaymentId } = await pendingOrder(c);
      await record(c, providerPaymentId, true);
      const { rows: pay } = await c.query<{ id: string }>(
        `select id from public.payments where order_id = $1`,
        [orderId],
      );
      await c.query(
        `insert into public.refunds (organization_id, event_id, payment_id, order_id, vendor_id,
           amount_ore, platform_fee_reversal_ore, provider_refund_id, reason)
         values ($1, $2, $3, $4, $5, 10000, 1250, 're_test_1', 'Feil vare')`,
        [ORG1, EVENT1, pay[0]!.id, orderId, VENDOR(1)],
      );
      const { rows } = await c.query(`select public.record_refund_result('re_test_1', true) as ok`);
      expect(rows[0]!.ok).toBe(true);
      const refund = await c.query(
        `select status, succeeded_at is not null as done from public.refunds where provider_refund_id = 're_test_1'`,
      );
      expect(refund.rows[0]).toEqual({ status: 'succeeded', done: true });
    });
  });
});
