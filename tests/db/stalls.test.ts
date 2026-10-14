import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { become, errorCode, submittedApplication } from './applications';
import { asOwner, attempt, connect, disconnect } from './db';
import { EVENT1, EVENT_VENDOR, STALL, USERS } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Stalls and stall fees (STL-02, STL-03, STL-04).

async function approved(c: pg.Client) {
  const ids = await submittedApplication(c);
  await become(c, USERS.eventAdmin);
  const { rows } = await c.query<{ result: { stall_fee_id: string; invoice_id: string } }>(
    `select public.review_application($1, 'approved', 'Welcome') as result`,
    [ids.eventVendorId],
  );
  await c.query('reset role');
  return { ...ids, ...rows[0]!.result };
}

const assign = (c: pg.Client, eventVendorId: string, stallId: string | null) =>
  c.query(`select public.assign_stall($1, $2)`, [eventVendorId, stallId]);

describe('stall assignment (STL-02)', () => {
  it('assigns, reassigns and releases, each change audited with the actor', async () => {
    await asOwner(async (c) => {
      const ids = await approved(c);
      await become(c, USERS.eventAdmin);
      await assign(c, ids.eventVendorId, STALL(3));
      await assign(c, ids.eventVendorId, STALL(4));
      await c.query('reset role');

      const rows = await c.query(
        `select stall_id, status from public.stall_assignments where event_vendor_id = $1
          order by status`,
        [ids.eventVendorId],
      );
      expect(rows.rows).toEqual([
        { stall_id: STALL(4), status: 'active' },
        { stall_id: STALL(3), status: 'released' },
      ]);
      const audit = await c.query(
        `select action, actor_id from public.audit_log
          where table_name = 'stall_assignments' and (new_data ->> 'event_vendor_id') = $1`,
        [ids.eventVendorId],
      );
      expect(audit.rows).toHaveLength(3); // assign A3, release A3, assign A4
      expect(audit.rows.every((r) => r.actor_id === USERS.eventAdmin)).toBe(true);

      // The stall fee remembers the stall; the amount is unchanged (owner decision P07).
      const fee = await c.query(
        `select stall_id, total_ore::int from public.stall_fees where event_vendor_id = $1`,
        [ids.eventVendorId],
      );
      expect(fee.rows).toEqual([{ stall_id: STALL(4), total_ore: 312500 }]);

      await become(c, USERS.eventAdmin);
      await assign(c, ids.eventVendorId, null);
      await c.query('reset role');
      const active = await c.query(
        `select count(*)::int as n from public.stall_assignments
          where event_vendor_id = $1 and status = 'active'`,
        [ids.eventVendorId],
      );
      expect(active.rows[0].n).toBe(0);
    });
  });

  it('only event staff assign; only approved vendors; one vendor per stall', async () => {
    await asOwner(async (c) => {
      const ids = await approved(c);
      const pending = await submittedApplication(c);
      for (const uid of [ids.uid, USERS.vendor, USERS.eventAdminOther, USERS.foreignAdmin]) {
        await become(c, uid);
        expect(
          await errorCode(c, `select public.assign_stall($1, $2)`, [ids.eventVendorId, STALL(3)]),
        ).toBe('42501');
      }
      await become(c, USERS.eventAdmin);
      expect(
        await errorCode(c, `select public.assign_stall($1, $2)`, [pending.eventVendorId, STALL(3)]),
      ).toBe('23514');
      // A1 is taken by vendor 1.
      expect(
        await errorCode(c, `select public.assign_stall($1, $2)`, [ids.eventVendorId, STALL(1)]),
      ).toBe('23505');
      // A stall of another organization's event.
      expect(
        await errorCode(c, `select public.assign_stall($1, $2)`, [ids.eventVendorId, STALL(11)]),
      ).toBe('23514');
    });
  });

  it('vendors see only their own assigned stall', async () => {
    await asOwner(async (c) => {
      const ids = await approved(c);
      await become(c, USERS.eventAdmin);
      await assign(c, ids.eventVendorId, STALL(3));
      await become(c, ids.uid);
      const stalls = await c.query(`select number from public.stalls`);
      expect(stalls.rows).toEqual([{ number: 'A3' }]);
    });
  });
});

describe('stall fee payment (STL-04)', () => {
  const pay = (c: pg.Client, stallFeeId: string, providerId: string, amount: number) =>
    c.query(`select public.record_fee_payment($1, 'mock', $2, $3) as id`, [
      stallFeeId,
      providerId,
      amount,
    ]);

  it('records the payment once, marks fee and invoice paid, and never touches the ledger', async () => {
    await asOwner(async (c) => {
      const ids = await approved(c);
      const first = await pay(c, ids.stall_fee_id, `mock_${ids.stall_fee_id}`, 312500);
      const again = await pay(c, ids.stall_fee_id, `mock_${ids.stall_fee_id}`, 312500);
      expect(again.rows[0].id).toBe(first.rows[0].id);

      const state = await c.query(
        `select f.status as fee, f.paid_at is not null as paid, i.status as invoice,
                (select count(*)::int from public.fee_payments p where p.stall_fee_id = f.id) as payments,
                (select count(*)::int from public.ledger_entries l where l.vendor_id = f.vendor_id) as ledger
           from public.stall_fees f join public.invoices i on i.stall_fee_id = f.id
          where f.id = $1`,
        [ids.stall_fee_id],
      );
      expect(state.rows[0]).toEqual({
        fee: 'paid',
        paid: true,
        invoice: 'paid',
        payments: 1,
        ledger: 0,
      });
    });
  });

  it('refuses a wrong amount and a second payment for a paid fee', async () => {
    await asOwner(async (c) => {
      const ids = await approved(c);
      expect(
        await errorCode(c, `select public.record_fee_payment($1, 'mock', 'x1', 100)`, [
          ids.stall_fee_id,
        ]),
      ).toBe('23514');
      await pay(c, ids.stall_fee_id, 'x2', 312500);
      expect(
        await errorCode(c, `select public.record_fee_payment($1, 'mock', 'x3', 312500)`, [
          ids.stall_fee_id,
        ]),
      ).toBe('23514');
    });
  });

  it('is server-only', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query(
        `select has_function_privilege('authenticated', 'public.record_fee_payment(uuid, public.payment_provider, text, bigint)', 'execute') as auth,
                has_function_privilege('service_role', 'public.record_fee_payment(uuid, public.payment_provider, text, bigint)', 'execute') as service`,
      );
      expect(rows[0]).toEqual({ auth: false, service: true });
    });
  });
});

describe('venue image and pins (STL-03)', () => {
  const putObject = (name: string, owner: string) =>
    `insert into storage.objects (bucket_id, name, owner_id) values ('event-media', '${name}', '${owner}')`;

  it('event staff upload the image and place pins; others cannot', async () => {
    await asOwner(async (c) => {
      await become(c, USERS.eventAdmin);
      expect(await attempt(c, putObject(`${EVENT1}/venue.png`, USERS.eventAdmin))).toBe('allowed');
      await c.query(`select public.set_venue_map($1, $2)`, [EVENT1, `${EVENT1}/venue.png`]);
      expect(
        await attempt(
          c,
          `update public.stalls set map_x = 5000, map_y = 2500 where id = '${STALL(3)}'`,
        ),
      ).toBe('allowed');

      for (const uid of [USERS.vendor, USERS.eventAdminOther, USERS.foreignAdmin]) {
        await become(c, uid);
        expect(await attempt(c, putObject(`${EVENT1}/x-${uid}.png`, uid))).toBe('denied');
        expect(await errorCode(c, `select public.set_venue_map($1, null)`, [EVENT1])).toBe('42501');
        expect(
          await attempt(c, `update public.stalls set map_x = 1 where id = '${STALL(3)}'`),
        ).toBe('denied');
      }
      await c.query('reset role');
      const event = await c.query(`select venue_map_path from public.events where id = $1`, [
        EVENT1,
      ]);
      expect(event.rows[0].venue_map_path).toBe(`${EVENT1}/venue.png`);
      // The image must live in the event's folder.
      await become(c, USERS.eventAdmin);
      expect(
        await errorCode(c, `select public.set_venue_map($1, 'elsewhere/x.png')`, [EVENT1]),
      ).toBe('23514');
    });
  });

  it('a vendor with an active assignment can read its stall pin', async () => {
    await asOwner(async (c) => {
      await become(c, USERS.vendor);
      const { rows } = await c.query(
        `select s.number from public.stalls s join public.stall_assignments a on a.stall_id = s.id
          where a.event_vendor_id = $1`,
        [EVENT_VENDOR(1)],
      );
      expect(rows).toEqual([{ number: 'A1' }]);
    });
  });
});
