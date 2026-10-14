import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, asRole, attempt, connect, disconnect } from './db';
import { EVENT1, EVENT3, EVENT_VENDOR, ORG1, ORG2, SETTLEMENT, STALL, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

/** Runs a statement and returns the Postgres error code it fails with (or null). */
async function errorCode(c: pg.Client, sql: string, params: unknown[] = []) {
  await c.query('savepoint probe');
  try {
    await c.query(sql, params);
    await c.query('release savepoint probe');
    return null;
  } catch (error) {
    await c.query('rollback to savepoint probe');
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/** Switches the current transaction to a signed-in user (after owner-level setup). */
async function becomeUser(c: pg.Client, uid: string, aal: 'aal1' | 'aal2' = 'aal2') {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated', aal }),
  ]);
  await c.query('set local role authenticated');
}

describe('append-only tables', () => {
  const timestampColumn: Record<string, string> = {
    ledger_entries: 'created_at',
    audit_log: 'created_at',
    psp_webhook_events: 'received_at',
    psp_webhook_attempts: 'attempted_at',
  };
  for (const [table, column] of Object.entries(timestampColumn)) {
    it(`${table}: UPDATE, DELETE and TRUNCATE fail even for the service role`, async () => {
      await asOwner(async (c) => {
        expect(await errorCode(c, `update public.${table} set ${column} = ${column}`)).toBe(
          'P0001',
        );
        expect(await errorCode(c, `delete from public.${table}`)).toBe('P0001');
        expect(await errorCode(c, `truncate public.${table} cascade`)).toBe('P0001');
      });
    });
  }
});

describe('ledger', () => {
  const entry = (tx: string, direction: string, amount: number) =>
    `insert into public.ledger_entries (organization_id, event_id, transaction_id, entry_type, account, direction, amount_ore)
     values ('${ORG1}', '${EVENT1}', '${tx}', 'adjustment', 'psp_clearing', '${direction}', ${amount})`;

  it('accepts a balanced transaction', async () => {
    await asOwner(async (c) => {
      const tx = crypto.randomUUID();
      await c.query(entry(tx, 'debit', 500));
      await c.query(entry(tx, 'credit', 500));
      expect(await errorCode(c, 'set constraints all immediate')).toBeNull();
    });
  });

  it('rejects an unbalanced transaction at commit', async () => {
    await asOwner(async (c) => {
      const tx = crypto.randomUUID();
      await c.query(entry(tx, 'debit', 500));
      await c.query(entry(tx, 'credit', 499));
      expect(await errorCode(c, 'set constraints all immediate')).toBe('23514');
    });
  });

  it('rejects zero or negative amounts', async () => {
    await asOwner(async (c) => {
      expect(await errorCode(c, entry(crypto.randomUUID(), 'debit', 0))).toBe('23514');
    });
  });
});

describe('settlement workflow (four eyes)', () => {
  const settlement = SETTLEMENT(1);
  const setStatus = (status: string) =>
    `update public.settlements set status = '${status}' where id = '${settlement}'`;

  it('an Event Admin prepares, a different Organization Admin approves', async () => {
    await asOwner(async (c) => {
      await becomeUser(c, USERS.eventAdmin);
      expect(await attempt(c, setStatus('prepared'))).toBe('allowed');
      // The Event Admin cannot approve.
      expect(await errorCode(c, setStatus('approved'))).toBe('42501');
      await c.query('reset role');
      await becomeUser(c, USERS.orgAdmin);
      expect(await attempt(c, setStatus('approved'))).toBe('allowed');
      await c.query('reset role');
      const { rows } = await c.query(
        `select prepared_by, approved_by from public.settlements where id = $1`,
        [settlement],
      );
      expect(rows[0]).toEqual({ prepared_by: USERS.eventAdmin, approved_by: USERS.orgAdmin });
    });
  });

  it('the preparer cannot approve their own batch', async () => {
    await asOwner(async (c) => {
      await becomeUser(c, USERS.orgAdmin);
      expect(await attempt(c, setStatus('prepared'))).toBe('allowed');
      expect(await errorCode(c, setStatus('approved'))).toBe('23514');
    });
  });

  it('users cannot skip steps or release payouts', async () => {
    await asOwner(async (c) => {
      await becomeUser(c, USERS.orgAdmin);
      expect(await errorCode(c, setStatus('approved'))).toBe('23514'); // draft → approved
      expect(await errorCode(c, setStatus('releasing'))).toBe('23514');
    });
  });

  it('records approved settlements in the audit log', async () => {
    await asOwner(async (c) => {
      await becomeUser(c, USERS.eventAdmin);
      await c.query(setStatus('prepared'));
      await c.query('reset role');
      await becomeUser(c, USERS.orgAdmin2);
      await c.query(setStatus('approved'));
      await c.query('reset role');
      const { rows } = await c.query(
        `select actor_id, new_data ->> 'status' as status from public.audit_log
          where table_name = 'settlements' and row_id = $1 and action = 'update'
          order by created_at, new_data ->> 'status' = 'approved'`,
        [settlement],
      );
      expect(rows.map((r) => [r.actor_id, r.status])).toEqual([
        [USERS.eventAdmin, 'prepared'],
        [USERS.orgAdmin2, 'approved'],
      ]);
    });
  });
});

describe('constraints', () => {
  it('one active assignment per stall', async () => {
    await asOwner(async (c) => {
      const code = await errorCode(
        c,
        `insert into public.stall_assignments (organization_id, event_id, stall_id, event_vendor_id, vendor_id)
         values ($1, $2, $3, $4, $5)`,
        [ORG1, EVENT1, STALL(1), EVENT_VENDOR(3), VENDOR(3)],
      );
      expect(code).toBe('23505');
    });
  });

  it('org number is unique across the platform, also between organizations', async () => {
    await asOwner(async (c) => {
      const code = await errorCode(
        c,
        `insert into public.vendors (organization_id, org_number, legal_name, display_name, slug)
         values ($1, '912345670', 'Kopi', 'Kopi', 'kopi')`,
        [ORG2],
      );
      expect(code).toBe('23505');
    });
  });

  it('rows cannot point at an event of another organization', async () => {
    await asOwner(async (c) => {
      const code = await errorCode(
        c,
        `insert into public.stalls (organization_id, event_id, number) values ($1, $2, 'Z1')`,
        [ORG1, EVENT3],
      );
      expect(code).toBe('23503');
    });
  });

  it('amounts cannot be negative', async () => {
    await asOwner(async (c) => {
      const code = await errorCode(
        c,
        `insert into public.products (organization_id, vendor_id, name, price_ore) values ($1, $2, 'X', -1)`,
        [ORG1, VENDOR(1)],
      );
      expect(code).toBe('23514');
    });
  });

  it('a paid order must carry its commission snapshot', async () => {
    await asOwner(async (c) => {
      const code = await errorCode(
        c,
        `insert into public.orders (organization_id, event_id, event_vendor_id, vendor_id, status, total_ore)
         values ($1, $2, $3, $4, 'new', 1000)`,
        [ORG1, EVENT1, EVENT_VENDOR(1), VENDOR(1)],
      );
      expect(code).toBe('23514');
    });
  });
});

describe('numbering', () => {
  it('order numbers count up per vendor and Oslo day', async () => {
    await asOwner(async (c) => {
      const insert = (ev: number, vendor: number) =>
        c.query(
          `insert into public.orders (organization_id, event_id, event_vendor_id, vendor_id, total_ore, service_date)
           values ($1, $2, $3, $4, 1000, '2027-06-12') returning order_number`,
          [ORG1, EVENT1, EVENT_VENDOR(ev), VENDOR(vendor)],
        );
      const numbers = [
        (await insert(1, 1)).rows[0].order_number,
        (await insert(1, 1)).rows[0].order_number,
        (await insert(2, 2)).rows[0].order_number,
      ];
      expect(numbers).toEqual([1, 2, 1]);
    });
  });

  it('invoice numbers are sequential per organization', async () => {
    await asOwner(async (c) => {
      const insert = () =>
        c.query(
          `insert into public.invoices (organization_id, event_id, kind, vendor_id, settlement_id, subtotal_ore, total_ore)
           values ($1, $2, 'commission', $3, $4, 100, 100) returning invoice_number`,
          [ORG1, EVENT1, VENDOR(1), SETTLEMENT(1)],
        );
      const first = Number((await insert()).rows[0].invoice_number);
      const second = Number((await insert()).rows[0].invoice_number);
      expect(second).toBe(first + 1);
    });
  });
});

describe('access edge cases', () => {
  it('visitors cannot read private vendor columns or payment-provider data', async () => {
    await asRole('anon', async (c) => {
      expect(await errorCode(c, 'select brreg_status from public.vendors')).toBe('42501');
      expect(await errorCode(c, 'select psp_account_id from public.event_vendors')).toBe('42501');
      expect(await errorCode(c, 'select contact_email from public.vendor_contacts')).toBe('42501');
      expect(await errorCode(c, 'select id from public.orders')).toBe('42501');
    });
  });

  it('visitors see only published vendors and their unarchived products', async () => {
    await asRole('anon', async (c) => {
      const vendors = await c.query('select slug from public.vendors order by slug');
      expect(vendors.rows.map((r) => r.slug)).toEqual([
        'asmara-cafe',
        'jollof-house-oslo',
        'mama-afrika-kjokken',
      ]);
      const products = await c.query('select count(*)::int as n from public.products');
      expect(products.rows[0].n).toBe(13); // 4 + 4 + 4 published + vendor 1's extra product
    });
  });

  it('a vendor cannot approve or publish its own application', async () => {
    await asOwner(async (c) => {
      await c.query(
        `update public.event_vendors set status = 'draft', is_published = false where id = $1`,
        [EVENT_VENDOR(1)],
      );
      await becomeUser(c, USERS.vendor);
      expect(
        await errorCode(c, `update public.event_vendors set status = 'approved' where id = $1`, [
          EVENT_VENDOR(1),
        ]),
      ).toBe('42501');
      expect(
        await attempt(c, `update public.event_vendors set status = 'submitted' where id = $1`, [
          EVENT_VENDOR(1),
        ]),
      ).toBe('allowed');
    });
  });

  it('a vendor cannot change its org number, and nobody can read psp ids through updates', async () => {
    await asRole('vendor', async (c) => {
      expect(
        await errorCode(c, `update public.vendors set org_number = '999999999' where id = $1`, [
          VENDOR(1),
        ]),
      ).toBe('42501');
      expect(
        await errorCode(c, `update public.event_vendors set psp_account_id = 'x' where id = $1`, [
          EVENT_VENDOR(1),
        ]),
      ).toBe('42501');
    });
  });

  it('an Organization Admin cannot attach a user to another organization’s vendor', async () => {
    await asRole('foreignAdmin', async (c) => {
      const code = await errorCode(
        c,
        `insert into public.memberships (organization_id, user_id, role, vendor_id) values ($1, $2, 'vendor', $3)`,
        [ORG2, USERS.foreignAdmin, VENDOR(1)],
      );
      expect(code).toBe('42501');
    });
  });

  it('commission rate changes are audit-logged with their reason', async () => {
    await asOwner(async (c) => {
      await becomeUser(c, USERS.orgAdmin);
      await c.query(
        `insert into public.commission_rules (organization_id, scope, type, rate_bp, reason, created_by)
         values ($1, 'organization', 'percentage', 1200, 'Ny standardsats 2028', $2)`,
        [ORG1, USERS.orgAdmin],
      );
      await c.query('reset role');
      const { rows } = await c.query(
        `select actor_id, reason from public.audit_log
          where table_name = 'commission_rules' and reason = 'Ny standardsats 2028'`,
      );
      expect(rows).toEqual([{ actor_id: USERS.orgAdmin, reason: 'Ny standardsats 2028' }]);
    });
  });
});
