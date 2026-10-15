import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { become, errorCode } from './applications';
import { asOwner, asRole, attempt, connect, disconnect } from './db';
import { CATEGORY1, EVENT1, EVENT_VENDOR, ORG1, PRODUCT, USERS, VENDOR } from './ids';

beforeAll(connect);
afterAll(disconnect);

// Vendor catalogue (CAT-01 … CAT-03) and the gallery (VIS-02).

const newProduct = async (c: pg.Client, values: Record<string, unknown> = {}) => {
  const row = {
    organization_id: ORG1,
    vendor_id: VENDOR(1),
    category_id: CATEGORY1,
    name: 'Egusi',
    price_ore: 16000,
    ...values,
  };
  const keys = Object.keys(row);
  const { rows } = await c.query<{ id: string }>(
    `insert into public.products (${keys.join(', ')})
     values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    Object.values(row),
  );
  return rows[0]!.id;
};

const anonSees = async (c: pg.Client, table: string, id: string) => {
  await c.query('reset role');
  await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  await c.query('set local role anon');
  const { rowCount } = await c.query(`select 1 from public.${table} where id = $1`, [id]);
  await c.query('reset role');
  return rowCount === 1;
};

describe('products (CAT-01)', () => {
  it('a vendor creates, edits and reads its own products; others cannot change them', async () => {
    await asRole('vendor', async (c) => {
      const id = await newProduct(c, {
        allergens: ['milk', 'sesame'],
        dietary_tags: ['vegetarian'],
      });
      expect(
        await attempt(c, `update public.products set price_ore = 17000 where id = $1`, [id]),
      ).toBe('allowed');
      const { rows } = await c.query(
        `select price_ore::int, allergens, dietary_tags, mva_rate_bp from public.products where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        price_ore: 17000,
        allergens: '{milk,sesame}',
        dietary_tags: '{vegetarian}',
        mva_rate_bp: 0,
      });
    });
    await asRole('vendorOther', async (c) => {
      expect(
        await attempt(c, `update public.products set price_ore = 1 where id = $1`, [PRODUCT(1)]),
      ).toBe('denied');
      const code = await errorCode(
        c,
        `insert into public.products (organization_id, vendor_id, name, price_ore)
         values ($1, $2, 'Snik', 100)`,
        [ORG1, VENDOR(1)],
      );
      expect(code).toBe('42501');
    });
  });

  it('charges mva only for mva-registered vendors, at 15 or 25 %', async () => {
    await asRole('vendor', async (c) => {
      const insert = (rate: number) =>
        errorCode(
          c,
          `insert into public.products (organization_id, vendor_id, name, price_ore, mva_rate_bp)
           values ($1, $2, 'Mva', 1000, $3)`,
          [ORG1, VENDOR(1), rate],
        );
      expect(await insert(1500)).toBe('23514');
    });
    await asOwner(async (c) => {
      await c.query(`update public.vendors set mva_registered = true where id = $1`, [VENDOR(1)]);
      await become(c, USERS.vendor);
      const insert = (rate: number) =>
        errorCode(
          c,
          `insert into public.products (organization_id, vendor_id, name, price_ore, mva_rate_bp)
           values ($1, $2, 'Mva', 1000, $3)`,
          [ORG1, VENDOR(1), rate],
        );
      expect(await insert(1500)).toBeNull();
      expect(await insert(2500)).toBeNull();
      expect(await insert(1200)).toBe('23514');
    });
  });

  it('records product changes in the audit log', async () => {
    await asOwner(async (c) => {
      await become(c, USERS.vendor);
      const id = await newProduct(c);
      await c.query(`update public.products set price_ore = 19000 where id = $1`, [id]);
      await c.query('reset role');
      const { rows } = await c.query(
        `select action, actor_id, old_data ->> 'price_ore' as old, new_data ->> 'price_ore' as new
           from public.audit_log where table_name = 'products' and row_id = $1
          order by created_at, action`,
        [id],
      );
      expect(rows).toEqual([
        { action: 'insert', actor_id: USERS.vendor, old: null, new: '16000' },
        { action: 'update', actor_id: USERS.vendor, old: '16000', new: '19000' },
      ]);
    });
  });

  it('reorders only the vendor’s own products', async () => {
    await asRole('vendor', async (c) => {
      const a = await newProduct(c, { name: 'A' });
      const b = await newProduct(c, { name: 'B' });
      await c.query(`select public.reorder_products($1, $2)`, [VENDOR(1), [b, a, PRODUCT(5)]]);
      const { rows } = await c.query(
        `select id, sort_order from public.products where id = any ($1) order by sort_order`,
        [[a, b]],
      );
      expect(rows).toEqual([
        { id: b, sort_order: 1 },
        { id: a, sort_order: 2 },
      ]);
      expect(await errorCode(c, `select public.reorder_products($1, $2)`, [VENDOR(2), [a]])).toBe(
        '42501',
      );
    });
    await asOwner(async (c) => {
      const { rows } = await c.query(`select sort_order from public.products where id = $1`, [
        PRODUCT(5),
      ]);
      expect(rows[0]!.sort_order).toBe(0);
    });
  });
});

describe('archive and delete (CAT-03)', () => {
  it('deletes a product nobody ordered, with its availability', async () => {
    await asRole('vendor', async (c) => {
      const id = await newProduct(c);
      await c.query(
        `insert into public.product_availability (organization_id, event_id, event_vendor_id, vendor_id, product_id)
         values ($1, $2, $3, $4, $5)`,
        [ORG1, EVENT1, EVENT_VENDOR(1), VENDOR(1), id],
      );
      await c.query(`select public.delete_product($1)`, [id]);
      const { rowCount } = await c.query(`select 1 from public.products where id = $1`, [id]);
      expect(rowCount).toBe(0);
    });
  });

  it('refuses to delete an ordered product, which can only be archived', async () => {
    await asRole('vendor', async (c) => {
      expect(await errorCode(c, `select public.delete_product($1)`, [PRODUCT(1)])).toBe('23503');
      expect(await errorCode(c, `delete from public.products where id = $1`, [PRODUCT(1)])).toBe(
        '42501',
      );
      expect(
        await attempt(c, `update public.products set archived_at = now() where id = $1`, [
          PRODUCT(1),
        ]),
      ).toBe('allowed');
      // Archiving takes it off sale at every event.
      const { rowCount } = await c.query(
        `select 1 from public.product_availability where product_id = $1`,
        [PRODUCT(1)],
      );
      expect(rowCount).toBe(0);
    });
  });

  it('only the owning vendor (or an Organization Admin) deletes', async () => {
    await asRole('vendorOther', async (c) => {
      expect(await errorCode(c, `select public.delete_product($1)`, [PRODUCT(30)])).toBe('42501');
    });
    await asRole('anon', async (c) => {
      expect(await errorCode(c, `select public.delete_product($1)`, [PRODUCT(30)])).toBe('42501');
    });
  });

  it('hides archived products from visitors', async () => {
    await asOwner(async (c) => {
      expect(await anonSees(c, 'products', PRODUCT(2))).toBe(true);
      await c.query(`update public.products set archived_at = now() where id = $1`, [PRODUCT(2)]);
      expect(await anonSees(c, 'products', PRODUCT(2))).toBe(false);
    });
  });
});

describe('per-event availability (CAT-02)', () => {
  it('the vendor puts products on sale for its own participation and marks them sold out', async () => {
    await asRole('vendor', async (c) => {
      const id = await newProduct(c);
      await c.query(
        `insert into public.product_availability (organization_id, event_id, event_vendor_id, vendor_id, product_id)
         values ($1, $2, $3, $4, $5)`,
        [ORG1, EVENT1, EVENT_VENDOR(1), VENDOR(1), id],
      );
      expect(
        await attempt(
          c,
          `update public.product_availability set is_available = false where product_id = $1`,
          [id],
        ),
      ).toBe('allowed');
      // Not on another vendor's participation.
      expect(
        await errorCode(
          c,
          `insert into public.product_availability (organization_id, event_id, event_vendor_id, vendor_id, product_id)
           values ($1, $2, $3, $4, $5)`,
          [ORG1, EVENT1, EVENT_VENDOR(2), VENDOR(1), id],
        ),
      ).not.toBeNull();
    });
    await asRole('vendorOther', async (c) => {
      expect(
        await attempt(
          c,
          `update public.product_availability set is_available = false where product_id = $1`,
          [PRODUCT(1)],
        ),
      ).toBe('denied');
    });
  });

  it('visitors see availability only for published participations', async () => {
    await asOwner(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `select id from public.product_availability where product_id = $1`,
        [PRODUCT(1)],
      );
      expect(await anonSees(c, 'product_availability', rows[0]!.id)).toBe(true);
      await c.query(`update public.event_vendors set is_published = false where id = $1`, [
        EVENT_VENDOR(1),
      ]);
      expect(await anonSees(c, 'product_availability', rows[0]!.id)).toBe(false);
    });
  });
});

describe('gallery (VIS-02)', () => {
  it('holds at most 8 images per vendor', async () => {
    await asRole('vendor', async (c) => {
      const insert = (n: number) =>
        errorCode(
          c,
          `insert into public.vendor_gallery_images (organization_id, vendor_id, storage_path, alt_text)
           values ($1, $2, $3, 'Bilde')`,
          [ORG1, VENDOR(1), `${VENDOR(1)}/g-${n}.jpg`],
        );
      // The fixtures already hold one image for vendor 1.
      for (let n = 2; n <= 8; n++) expect(await insert(n)).toBeNull();
      expect(await insert(9)).toBe('23514');
    });
  });

  it('requires alt text', async () => {
    await asRole('vendor', async (c) => {
      expect(
        await errorCode(
          c,
          `insert into public.vendor_gallery_images (organization_id, vendor_id, storage_path, alt_text)
           values ($1, $2, 'x.jpg', '  ')`,
          [ORG1, VENDOR(1)],
        ),
      ).toBe('23514');
    });
  });
});
