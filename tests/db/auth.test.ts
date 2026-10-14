import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, asRole, attempt, connect, disconnect } from './db';
import { ORG1, ORG2, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

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

async function count(c: pg.Client, sql: string, params: unknown[] = []) {
  const { rows } = await c.query<{ n: number }>(
    `select count(*)::int as n from (${sql}) q`,
    params,
  );
  return rows[0]!.n;
}

/** Creates an auth user the way GoTrue does (fires the sign-up trigger). */
async function createUser(c: pg.Client, metadata: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
    [id, `${id}@signup.test`, JSON.stringify(metadata)],
  );
  return id;
}

describe('MFA is required for admin powers (AUTH-04)', () => {
  it('an Organization Admin without MFA (aal1) has no admin access', async () => {
    await asRole(
      'orgAdmin',
      async (c) => {
        expect(await count(c, `select 1 from public.vendor_contacts`)).toBe(0);
        expect(await count(c, `select 1 from public.audit_log`)).toBe(0);
        expect(
          await attempt(
            c,
            `insert into public.commission_rules (organization_id, scope, type, rate_bp, reason, created_by)
             values ($1, 'organization', 'percentage', 900, 'x', $2)`,
            [ORG1, USERS.orgAdmin],
          ),
        ).toBe('denied');
        // They can still see their own memberships, so the app can send them to MFA.
        expect(
          await count(c, `select 1 from public.memberships where user_id = $1`, [USERS.orgAdmin]),
        ).toBe(1);
      },
      { aal: 'aal1' },
    );
  });

  it('a Platform Owner without MFA (aal1) cannot read other tenants', async () => {
    await asRole(
      'platformOwner',
      async (c) => {
        expect(await count(c, `select 1 from public.organizations where id = $1`, [ORG2])).toBe(0);
        expect(await count(c, `select 1 from public.platform_admins`)).toBe(1); // own row only
      },
      { aal: 'aal1' },
    );
  });

  it('vendors do not need MFA', async () => {
    await asRole(
      'vendor',
      async (c) => {
        expect(await count(c, `select 1 from public.vendors where id = $1`, [VENDOR(1)])).toBe(1);
      },
      { aal: 'aal1' },
    );
  });
});

describe('self sign-up (AUTH-03)', () => {
  it('creates a pending vendor membership in the named organization', async () => {
    await asOwner(async (c) => {
      const id = await createUser(c, {
        signup_role: 'vendor',
        organization_slug: 'affn',
        locale: 'nb',
      });
      const { rows } = await c.query(
        `select organization_id, role, status, vendor_id from public.memberships where user_id = $1`,
        [id],
      );
      expect(rows).toEqual([
        { organization_id: ORG1, role: 'vendor', status: 'pending', vendor_id: null },
      ]);
    });
  });

  it('creates a pending sponsor membership', async () => {
    await asOwner(async (c) => {
      const id = await createUser(c, { signup_role: 'sponsor', organization_slug: 'affn' });
      const { rows } = await c.query(
        `select role, status from public.memberships where user_id = $1`,
        [id],
      );
      expect(rows).toEqual([{ role: 'sponsor', status: 'pending' }]);
    });
  });

  it.each([
    ['an admin role', { signup_role: 'org_admin', organization_slug: 'affn' }],
    ['an event admin role', { signup_role: 'event_admin', organization_slug: 'affn' }],
    ['an unknown organization', { signup_role: 'vendor', organization_slug: 'nope' }],
    ['no role (invited users)', { locale: 'en' }],
  ])('creates no membership for %s', async (_, metadata) => {
    await asOwner(async (c) => {
      const id = await createUser(c, metadata);
      expect(await count(c, `select 1 from public.memberships where user_id = $1`, [id])).toBe(0);
    });
  });

  it('a pending membership grants no data access', async () => {
    const id = await asOwner(async (c) => {
      const userId = await createUser(c, { signup_role: 'vendor', organization_slug: 'affn' });
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' }),
      ]);
      await c.query('set local role authenticated');
      return {
        events: await count(c, 'select 1 from public.events'),
        vendors: await count(c, 'select 1 from public.vendors'),
        categories: await count(c, 'select 1 from public.product_categories'),
        ownMembership: await count(c, 'select 1 from public.memberships'),
      };
    });
    expect(id).toEqual({ events: 0, vendors: 0, categories: 0, ownMembership: 1 });
  });

  it('pending memberships cannot be active without a business', async () => {
    await asOwner(async (c) => {
      const id = await createUser(c, { signup_role: 'vendor', organization_slug: 'affn' });
      expect(
        await errorCode(c, `update public.memberships set status = 'active' where user_id = $1`, [
          id,
        ]),
      ).toBe('23514');
    });
  });
});

describe('access token hook', () => {
  it('adds platform owner flag and roles to the JWT claims', async () => {
    await asOwner(async (c) => {
      const call = async (uid: string) =>
        (
          await c.query(
            `select private.custom_access_token_hook($1::jsonb) -> 'claims' -> 'affn' as affn`,
            [JSON.stringify({ user_id: uid, claims: { sub: uid, aal: 'aal1' } })],
          )
        ).rows[0].affn;
      expect(await call(USERS.platformOwner)).toEqual({ po: true, roles: [] });
      expect(await call(USERS.orgAdmin)).toEqual({
        po: false,
        roles: [{ org: ORG1, role: 'org_admin', status: 'active' }],
      });
    });
  });

  it('cannot be called through the API', async () => {
    await asRole('vendor', async (c) => {
      expect(await errorCode(c, `select private.custom_access_token_hook('{}'::jsonb)`)).toBe(
        '42501',
      );
    });
  });
});

describe('rate limiter', () => {
  it('allows hits up to the limit, then blocks until the window passes', async () => {
    await asOwner(async (c) => {
      const key = `test:${crypto.randomUUID()}`;
      const hit = async () =>
        (await c.query(`select public.rate_limit_hit($1, 2, 60) as ok`, [key])).rows[0].ok;
      const check = async () =>
        (await c.query(`select public.rate_limit_check($1, 2, 60) as ok`, [key])).rows[0].ok;
      expect(await check()).toBe(true);
      expect([await hit(), await hit()]).toEqual([true, true]);
      expect(await check()).toBe(false);
      expect(await hit()).toBe(false);
      await c.query(
        `update private.rate_limits set window_start = now() - interval '61 seconds' where key = $1`,
        [key],
      );
      expect(await check()).toBe(true);
      expect(await hit()).toBe(true);
    });
  });

  it('only the service role may call it', async () => {
    for (const role of ['anon', 'vendor'] as const) {
      await asRole(role, async (c) => {
        expect(await errorCode(c, `select public.rate_limit_hit('x', 1, 60)`)).toBe('42501');
        expect(await errorCode(c, `select public.rate_limit_check('x', 1, 60)`)).toBe('42501');
      });
    }
  });
});

describe('role grants and revocations are audited', () => {
  it('logs granting and revoking an Event Admin role with the actor', async () => {
    await asOwner(async (c) => {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: USERS.orgAdmin, role: 'authenticated', aal: 'aal2' }),
      ]);
      await c.query('set local role authenticated');
      const { rows } = await c.query(
        `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'event_admin') returning id`,
        [ORG1, USERS.orgAdmin2],
      );
      await c.query(`delete from public.memberships where id = $1`, [rows[0].id]);
      await c.query('reset role');
      const log = await c.query(
        `select action, actor_id from public.audit_log where table_name = 'memberships' and row_id = $1 order by created_at, action = 'delete'`,
        [rows[0].id],
      );
      expect(log.rows).toEqual([
        { action: 'insert', actor_id: USERS.orgAdmin },
        { action: 'delete', actor_id: USERS.orgAdmin },
      ]);
    });
  });
});
