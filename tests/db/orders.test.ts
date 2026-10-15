import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, asRole, connect, disconnect } from './db';
import { EVENT1, EVENT_VENDOR, USERS } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Orders (ORD-01 … ORD-04). Fixture order 9…1 is vendor 1's paid order (kr 185, fee 23,13) with
// a pending partial refund of kr 10; vendor 1 has stall A1 at AFFN 2027 (12–13 June 2027).
const ORDER = '90000000-0000-4000-8000-000000000001';
const OTHER_ORDER = '90000000-0000-4000-8000-000000000002';

const insertOrder = (c: pg.Client, serviceDate: string, eventVendor = EVENT_VENDOR(1)) =>
  c
    .query<{ id: string; order_code: string; order_number: number }>(
      `insert into public.orders (organization_id, event_id, event_vendor_id, vendor_id,
              service_date, total_ore)
       select organization_id, event_id, id, vendor_id, $2, 10000
         from public.event_vendors where id = $1
       returning id, order_code, order_number`,
      [eventVendor, serviceDate],
    )
    .then((r) => r.rows[0]!);

const failure = (c: pg.Client, sql: string, params: unknown[] = []) =>
  c
    .query('savepoint f')
    .then(() => c.query(sql, params))
    .then(
      async (result) => {
        await c.query('release savepoint f');
        return result.rowCount === 0 ? 'no rows' : null;
      },
      async (error: { message: string }) => {
        await c.query('rollback to savepoint f');
        return error.message;
      },
    );

describe('order codes (ORD-01)', () => {
  it('combine festival day letter, stall and the daily number', async () => {
    await asOwner(async (c) => {
      expect((await insertOrder(c, '2027-06-12')).order_code).toBe('A·A1-001');
      expect((await insertOrder(c, '2027-06-12')).order_code).toBe('A·A1-002');
      expect((await insertOrder(c, '2027-06-13')).order_code).toBe('B·A1-001');
      // Outside the festival days: T (test / pre-event).
      expect((await insertOrder(c, '2027-06-11')).order_code).toBe('T·A1-001');
      expect((await insertOrder(c, '2027-06-14')).order_code).toBe('T·A1-001');
      // Vendor 3 has no stall.
      const noStall = await insertOrder(c, '2027-06-12', EVENT_VENDOR(3)).catch(() => null);
      if (noStall) expect(noStall.order_code).toBe('A-001');
    });
  });

  it('keeps the code once issued, even if the stall changes later', async () => {
    await asOwner(async (c) => {
      const order = await insertOrder(c, '2027-06-12');
      await c.query(
        `update public.stall_assignments set status = 'released', released_at = now()
                      where event_vendor_id = $1`,
        [EVENT_VENDOR(1)],
      );
      const { rows } = await c.query(`select order_code from public.orders where id = $1`, [
        order.id,
      ]);
      expect(rows[0].order_code).toBe('A·A1-001');
    });
  });
});

describe('kitchen status changes (ORD-01, ORD-02)', () => {
  it('moves one step at a time and stamps the time', async () => {
    await asRole('vendor', async (c) => {
      for (const status of ['accepted', 'preparing', 'ready', 'collected']) {
        expect(
          await failure(c, `update public.orders set status = $2 where id = $1`, [ORDER, status]),
          status,
        ).toBeNull();
      }
      const { rows } = await c.query(
        `select status, accepted_at is not null as a, preparing_at is not null as p,
                ready_at is not null as r, collected_at is not null as c
           from public.orders where id = $1`,
        [ORDER],
      );
      expect(rows[0]).toEqual({ status: 'collected', a: true, p: true, r: true, c: true });
    });
  });

  it('refuses skipped steps, going back, and cancelling without a refund', async () => {
    await asRole('vendor', async (c) => {
      const set = (status: string) =>
        failure(c, `update public.orders set status = $2 where id = $1`, [ORDER, status]);
      expect(await set('ready')).toMatch(/invalid_transition/);
      expect(await set('cancelled')).toMatch(/invalid_transition/);
      expect(await set('pending_payment')).toMatch(/invalid_transition/);
      expect(await set('accepted')).toBeNull();
      expect(await set('new')).toMatch(/invalid_transition/);
      // Timestamps come from the database, not the client.
      await c.query(`update public.orders set cancelled_at = now() where id = $1`, [ORDER]);
      const { rows } = await c.query(`select cancelled_at from public.orders where id = $1`, [
        ORDER,
      ]);
      expect(rows[0].cancelled_at).toBeNull();
    });
  });

  it("cannot touch another vendor's order", async () => {
    await asRole('vendor', async (c) => {
      expect(
        await failure(c, `update public.orders set status = 'accepted' where id = $1`, [
          OTHER_ORDER,
        ]),
      ).toBe('no rows');
    });
    await asRole('anon', async (c) => {
      expect(
        await failure(c, `update public.orders set status = 'accepted' where id = $1`, [ORDER]),
      ).toMatch(/permission denied/);
    });
  });

  it('writes each status change to the audit log', async () => {
    await asRole('vendor', async (c) => {
      await c.query(`update public.orders set status = 'accepted' where id = $1`, [ORDER]);
      await c.query('reset role'); // vendors cannot read the audit log
      const { rows } = await c.query(
        `select actor_id, new_data ->> 'status' as status from public.audit_log
          where table_name = 'orders' and row_id = $1 order by created_at desc limit 1`,
        [ORDER],
      );
      expect(rows[0]).toEqual({ actor_id: USERS.vendor, status: 'accepted' });
    });
  });
});

describe('cancelling a paid order (ORD-04)', () => {
  const cancel = (c: pg.Client, order = ORDER, reason = 'Tomt for ris') =>
    c
      .query<{ result: Record<string, string | number> }>(
        `select public.begin_order_cancellation($1, $2, $3) as result`,
        [order, reason, USERS.vendor],
      )
      .then((r) => r.rows[0]!.result);

  it('cancels and records a pending refund of what is left, once', async () => {
    await asOwner(async (c) => {
      const first = await cancel(c);
      // kr 185 paid, kr 10 already being refunded → kr 175; fee 23,13 − 1,25 → 21,88.
      expect(first).toMatchObject({
        refund_status: 'pending',
        amount_ore: 17_500,
        platform_fee_reversal_ore: 2_188,
        provider: 'mock',
        provider_payment_id: 'pay_1',
      });
      const again = await cancel(c);
      expect(again.refund_id).toBe(first.refund_id);
      const { rows } = await c.query(
        `select status, cancel_reason, cancelled_at is not null as at from public.orders where id = $1`,
        [ORDER],
      );
      expect(rows[0]).toEqual({ status: 'cancelled', cancel_reason: 'Tomt for ris', at: true });
      const audit = await c.query(
        `select actor_id, reason from public.audit_log
          where table_name = 'orders' and row_id = $1 order by created_at desc limit 1`,
        [ORDER],
      );
      expect(audit.rows[0]).toEqual({ actor_id: USERS.vendor, reason: 'Tomt for ris' });
    });
  });

  it('completes the refund with the provider result, idempotently', async () => {
    await asOwner(async (c) => {
      const { refund_id } = await cancel(c);
      for (let i = 0; i < 2; i++) {
        await c.query(`select public.record_order_refund($1, 'mock_re_1', true, 2188)`, [
          refund_id,
        ]);
      }
      const { rows } = await c.query(
        `select status, provider_refund_id, platform_fee_reversal_ore::int as fee
           from public.refunds where id = $1`,
        [refund_id],
      );
      expect(rows[0]).toEqual({ status: 'succeeded', provider_refund_id: 'mock_re_1', fee: 2_188 });
      // A failed result later never undoes a completed refund.
      await c.query(`select public.record_order_refund($1, 'mock_re_1', false, 0)`, [refund_id]);
      const after = await c.query(`select status from public.refunds where id = $1`, [refund_id]);
      expect(after.rows[0].status).toBe('succeeded');
    });
  });

  it('retries with a new refund after a failed one', async () => {
    await asOwner(async (c) => {
      const { refund_id } = await cancel(c);
      await c.query(`select public.record_order_refund($1, null, false, 0)`, [refund_id]);
      const retry = await cancel(c);
      expect(retry.refund_id).not.toBe(refund_id);
      expect(retry.amount_ore).toBe(17_500);
    });
  });

  it('needs a reason and a paid, open order', async () => {
    await asOwner(async (c) => {
      expect(
        await failure(c, `select public.begin_order_cancellation($1, ' ', null)`, [ORDER]),
      ).toMatch(/reason_required/);
      await c.query(`update public.orders set status = 'collected' where id = $1`, [ORDER]);
      expect(
        await failure(c, `select public.begin_order_cancellation($1, 'x', null)`, [ORDER]),
      ).toMatch(/not_cancellable/);
    });
  });

  it('is server-only', async () => {
    await asOwner(async (c) => {
      for (const fn of [
        'public.begin_order_cancellation(uuid, text, uuid)',
        'public.record_order_refund(uuid, text, boolean, bigint)',
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
});

describe('realtime (ORD-02, ORD-03)', () => {
  it('publishes order changes for the kitchen', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'`,
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it("broadcasts status changes on the order's tracking topic", async () => {
    await asOwner(async (c) => {
      await c.query(`update public.orders set status = 'accepted' where id = $1`, [ORDER]);
      const { rows } = await c.query(
        `select m.payload ->> 'status' as status, m.private
           from realtime.messages m
           join public.orders o on m.topic = 'order:' || o.tracking_token
          where o.id = $1`,
        [ORDER],
      );
      expect(rows).toEqual([{ status: 'accepted', private: false }]);
      void EVENT1;
    });
  });
});
