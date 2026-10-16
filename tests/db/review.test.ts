import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { become, errorCode, submittedApplication } from './applications';
import { asOwner, connect, disconnect } from './db';
import { USERS } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Review decisions (REV-02, REV-03, SYS-01, STL-04, COM-03).

const review = (
  c: pg.Client,
  id: string,
  decision: string,
  note: string | null = 'Looks good',
  rate: number | null = null,
  reason: string | null = null,
) =>
  c.query<{ result: Record<string, unknown> }>(
    `select public.review_application($1, $2::public.application_status, $3, $4, $5) as result`,
    [id, decision, note, rate, reason],
  );

const statusAudit = (c: pg.Client, id: string) =>
  c.query<{ actor_id: string; old_status: string; new_status: string; reason: string }>(
    `select actor_id, old_data ->> 'status' as old_status, new_data ->> 'status' as new_status,
            reason
       from public.audit_log
      where table_name = 'event_vendors' and row_id = $1
      order by created_at, id`,
    [id],
  );

describe('review actions (REV-02)', () => {
  it('every decision moves the status, records the note and writes one audit row', async () => {
    await asOwner(async (c) => {
      const cases: [string, string][] = [
        ['under_review', 'Starting the review'],
        ['more_info_requested', 'Please add a menu with prices'],
      ];
      const ids = await submittedApplication(c);
      await become(c, USERS.eventAdmin);
      for (const [decision, note] of cases) await review(c, ids.eventVendorId, decision, note);

      await c.query('reset role');
      const reviews = await c.query(
        `select from_status, to_status, note, actor_id from public.application_reviews
          where event_vendor_id = $1 order by created_at, id`,
        [ids.eventVendorId],
      );
      // Same transaction in this test, so the same timestamp: compare without order.
      expect(reviews.rows).toHaveLength(2);
      expect(reviews.rows).toEqual(
        expect.arrayContaining([
          {
            from_status: 'submitted',
            to_status: 'under_review',
            note: 'Starting the review',
            actor_id: USERS.eventAdmin,
          },
          {
            from_status: 'under_review',
            to_status: 'more_info_requested',
            note: 'Please add a menu with prices',
            actor_id: USERS.eventAdmin,
          },
        ]),
      );
      // One audit row per action, with actor, before and after values and the note.
      const audit = await statusAudit(c, ids.eventVendorId);
      expect(audit.rows.filter((r) => r.actor_id === USERS.eventAdmin)).toHaveLength(2);
      expect(audit.rows).toEqual(
        expect.arrayContaining([
          {
            actor_id: USERS.eventAdmin,
            old_status: 'submitted',
            new_status: 'under_review',
            reason: 'Starting the review',
          },
          {
            actor_id: USERS.eventAdmin,
            old_status: 'under_review',
            new_status: 'more_info_requested',
            reason: 'Please add a menu with prices',
          },
        ]),
      );
      const reviewAudit = await c.query(
        `select count(*)::int as n from public.audit_log where table_name = 'application_reviews'
            and new_data ->> 'event_vendor_id' = $1`,
        [ids.eventVendorId],
      );
      expect(reviewAudit.rows[0].n).toBe(0);
    });
  });

  it('reject and waitlist are final decisions with a note', async () => {
    await asOwner(async (c) => {
      const a = await submittedApplication(c);
      const b = await submittedApplication(c);
      await become(c, USERS.eventAdmin);
      await review(c, a.eventVendorId, 'rejected', 'Too many vendors with the same menu');
      await review(c, b.eventVendorId, 'waitlisted', 'Full for now');
      await c.query('reset role');
      const rows = await c.query(
        `select id, status, decided_at is not null as decided from public.event_vendors
          where id = any($1) order by status`,
        [[a.eventVendorId, b.eventVendorId]],
      );
      expect(rows.rows.map((r) => [r.status, r.decided])).toEqual([
        ['rejected', true],
        ['waitlisted', true],
      ]);
      // Waitlisted can still be approved later; rejected cannot.
      await become(c, USERS.eventAdmin);
      expect(
        await errorCode(c, `select public.review_application($1, 'approved', 'x')`, [
          a.eventVendorId,
        ]),
      ).toBe('23514');
      expect(
        await errorCode(c, `select public.review_application($1, 'approved', 'Space opened up')`, [
          b.eventVendorId,
        ]),
      ).toBeNull();
    });
  });

  it('a note is required and only valid moves are allowed', async () => {
    await asOwner(async (c) => {
      const ids = await submittedApplication(c);
      await become(c, USERS.eventAdmin);
      expect(
        await errorCode(c, `select public.review_application($1, 'approved', '  ')`, [
          ids.eventVendorId,
        ]),
      ).toBe('23514');
      expect(
        await errorCode(c, `select public.review_application($1, 'draft', 'x')`, [
          ids.eventVendorId,
        ]),
      ).toBe('23514');
      expect(
        await errorCode(c, `select public.review_application($1, 'submitted', 'x')`, [
          ids.eventVendorId,
        ]),
      ).toBe('23514');
    });
  });

  it('only staff of the event can review', async () => {
    await asOwner(async (c) => {
      const ids = await submittedApplication(c);
      for (const uid of [
        ids.uid,
        USERS.vendor,
        USERS.eventAdminOther,
        USERS.foreignAdmin,
        USERS.sponsor,
      ]) {
        await become(c, uid);
        expect(
          await errorCode(c, `select public.review_application($1, 'approved', 'x')`, [
            ids.eventVendorId,
          ]),
        ).toBe('42501');
      }
      await become(c, USERS.orgAdmin);
      expect(
        await errorCode(c, `select public.review_application($1, 'under_review', 'x')`, [
          ids.eventVendorId,
        ]),
      ).toBeNull();
    });
  });
});

describe('approval (STL-04, COM-03)', () => {
  it('uses the event’s mva rate on stall fees (configurable until the accountant confirms)', async () => {
    await asOwner(async (c) => {
      await c.query(
        `update public.events set stall_fee_mva_bp = 1500 where id = '20000000-0000-4000-8000-000000000001'`,
      );
      const ids = await submittedApplication(c);
      await become(c, USERS.eventAdmin);
      const { rows } = await review(c, ids.eventVendorId, 'approved', 'Welcome');
      await c.query('reset role');
      const invoice = await c.query(
        `select subtotal_ore::int, mva_ore::int, total_ore::int from public.invoices where id = $1`,
        [rows[0]!.result.invoice_id],
      );
      // kr 2 500 + 15 % = kr 375 mva.
      expect(invoice.rows[0]).toEqual({ subtotal_ore: 250000, mva_ore: 37500, total_ore: 287500 });
      const audit = await c.query(
        `select new_data ->> 'stall_fee_mva_bp' as bp from public.audit_log
          where table_name = 'events' and row_id = '20000000-0000-4000-8000-000000000001'`,
      );
      expect(audit.rows.map((r) => r.bp)).toContain('1500');
    });
  });

  it('issues the stall fee with 25 % mva and a numbered invoice', async () => {
    await asOwner(async (c) => {
      const ids = await submittedApplication(c);
      const before = await c.query(
        // One series per organization, shared with sponsor invoices.
        `select coalesce(last_number, 0)::int as n from public.invoice_counters
          where organization_id = '10000000-0000-4000-8000-000000000001'`,
      );
      await become(c, USERS.eventAdmin);
      const { rows } = await review(c, ids.eventVendorId, 'approved', 'Welcome to AFFN 2027');
      await c.query('reset role');
      const fee = await c.query(
        `select amount_ore::int, mva_ore::int, total_ore::int, status from public.stall_fees
          where event_vendor_id = $1`,
        [ids.eventVendorId],
      );
      expect(fee.rows).toEqual([
        { amount_ore: 250000, mva_ore: 62500, total_ore: 312500, status: 'invoiced' },
      ]);
      const invoice = await c.query(
        `select kind, invoice_number::int, subtotal_ore::int, mva_ore::int, total_ore::int, status
           from public.invoices where id = $1`,
        [rows[0]!.result.invoice_id],
      );
      expect(invoice.rows[0]).toEqual({
        kind: 'stall_fee',
        invoice_number: before.rows[0].n + 1,
        subtotal_ore: 250000,
        mva_ore: 62500,
        total_ore: 312500,
        status: 'issued',
      });
      // The vendor sees its own stall fee and invoice, but not the ledger: no ledger rows.
      const ledger = await c.query(
        `select count(*)::int as n from public.ledger_entries where vendor_id = $1`,
        [ids.vendorId],
      );
      expect(ledger.rows[0].n).toBe(0);
      await become(c, ids.uid);
      const visible = await c.query(`select id from public.invoices`);
      expect(visible.rows.map((r) => r.id)).toEqual([rows[0]!.result.invoice_id]);
    });
  });

  it('an Event Admin cannot override commission; an Organization Admin can, with a reason', async () => {
    await asOwner(async (c) => {
      const ids = await submittedApplication(c);
      await become(c, USERS.eventAdmin);
      expect(
        await errorCode(
          c,
          `select public.review_application($1, 'approved', 'ok', 800, 'Small stall')`,
          [ids.eventVendorId],
        ),
      ).toBe('42501');
      await become(c, USERS.orgAdmin);
      expect(
        await errorCode(c, `select public.review_application($1, 'approved', 'ok', 800, null)`, [
          ids.eventVendorId,
        ]),
      ).toBe('23514');
      await review(c, ids.eventVendorId, 'approved', 'Welcome', 800, 'New vendor discount');
      await c.query('reset role');
      const rule = await c.query(
        `select scope, rate_bp, reason, created_by from public.commission_rules where vendor_id = $1`,
        [ids.vendorId],
      );
      expect(rule.rows).toEqual([
        {
          scope: 'vendor',
          rate_bp: 800,
          reason: 'New vendor discount',
          created_by: USERS.orgAdmin,
        },
      ]);
      const audit = await c.query(
        `select actor_id, reason from public.audit_log
          where table_name = 'commission_rules' and new_data ->> 'vendor_id' = $1`,
        [ids.vendorId],
      );
      expect(audit.rows).toEqual([{ actor_id: USERS.orgAdmin, reason: 'New vendor discount' }]);
    });
  });

  it('approval needs the stall type and the accepted agreement', async () => {
    await asOwner(async (c) => {
      const ids = await submittedApplication(c);
      await c.query(`update public.event_vendors set stall_type_id = null where id = $1`, [
        ids.eventVendorId,
      ]);
      await become(c, USERS.eventAdmin);
      expect(
        await errorCode(c, `select public.review_application($1, 'approved', 'ok')`, [
          ids.eventVendorId,
        ]),
      ).toBe('23514');
    });
  });
});

describe('internal notes (REV-03)', () => {
  it('are visible to event staff only, never to the vendor', async () => {
    await asOwner(async (c) => {
      const ids = await submittedApplication(c);
      await become(c, USERS.eventAdmin);
      await c.query(
        `insert into public.internal_notes (organization_id, event_id, event_vendor_id, body, author_id)
         select organization_id, event_id, id, 'Ring dem om menyen', $2 from public.event_vendors where id = $1`,
        [ids.eventVendorId, USERS.eventAdmin],
      );
      const count = async () =>
        (
          await c.query(
            `select count(*)::int as n from public.internal_notes where event_vendor_id = $1`,
            [ids.eventVendorId],
          )
        ).rows[0].n;
      expect(await count()).toBe(1);
      await become(c, USERS.orgAdmin);
      expect(await count()).toBe(1);
      for (const uid of [ids.uid, USERS.vendor, USERS.eventAdminOther, USERS.foreignAdmin]) {
        await become(c, uid);
        expect(await count()).toBe(0);
      }
      // The vendor cannot write notes either.
      await become(c, ids.uid);
      expect(
        await errorCode(
          c,
          `insert into public.internal_notes (organization_id, event_id, event_vendor_id, body, author_id)
           select organization_id, event_id, id, 'x', $2 from public.event_vendors where id = $1`,
          [ids.eventVendorId, ids.uid],
        ),
      ).not.toBeNull();
    });
  });
});
