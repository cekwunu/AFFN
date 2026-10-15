import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { submittedApplicant } from './support/applicants';
import { signIn } from './support/auth';
import { AFFN_2027, sql } from './support/db';
import { solidPng } from './support/png';

// Vendor portal and catalogue (CAT-01 … CAT-03). A fresh vendor is approved per run, so the
// tests can run again without a database reset.

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

async function approvedVendor(label: string) {
  const applicant = await submittedApplicant(label);
  await sql(`update public.event_vendors set status = 'approved' where id = $1`, [
    applicant.eventVendorId,
  ]);
  return applicant;
}

async function newProduct(
  page: Page,
  values: { name: string; price: string; allergens?: string[]; tags?: string[] },
) {
  await page.goto('/vendor/products/new');
  await page.getByRole('textbox', { name: 'Navn', exact: true }).fill(values.name);
  await page.getByLabel('Pris (kr)').fill(values.price);
  for (const tag of values.tags ?? []) await page.getByLabel(tag, { exact: true }).check();
  if (values.allergens?.length) {
    for (const a of values.allergens) await page.getByLabel(a, { exact: true }).check();
  } else {
    await page.getByLabel('Inneholder ingen av de 14 allergenene').check();
  }
  await page.getByRole('button', { name: 'Lagre produktet' }).click();
  await expect(page.getByText('Produktet er opprettet.')).toBeVisible();
  return page.url().match(/products\/([0-9a-f-]{36})/)![1]!;
}

const menuNames = (page: Page) =>
  page.getByTestId('product-row').locator('span.font-semibold').allTextContents();

test.describe.configure({ mode: 'serial' });

test('products: create with allergens and image, edit, duplicate, reorder, sell, sold out, archive, delete (CAT-01 … CAT-03)', async ({
  page,
}) => {
  test.slow();
  const vendor = await approvedVendor('meny');
  await signIn(page, vendor.email, vendor.password);
  await expect(page).toHaveURL(/\/vendor$/);
  await expect(page.getByRole('heading', { level: 1, name: `Hei, ${vendor.name}` })).toBeVisible();
  await expect(page.getByTestId('next-steps')).toContainText('Legg inn minst ett produkt');
  await expect(axe(page)).resolves.toEqual([]);

  // Validation: allergens must be declared.
  await page.getByRole('link', { name: 'Produkter', exact: true }).click();
  await expect(page.getByText('Ingen produkter ennå. Legg til det første.')).toBeVisible();
  await page.getByRole('link', { name: 'Nytt produkt' }).first().click();
  await page.getByRole('textbox', { name: 'Navn', exact: true }).fill('Suya');
  await page.getByLabel('Pris (kr)').fill('155');
  await page.getByRole('button', { name: 'Lagre produktet' }).click();
  await expect(
    page.getByText('Kryss av allergenene, eller bekreft at produktet ikke inneholder noen av dem.'),
  ).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // Create with allergens, a dietary tag and an image compressed in the browser.
  await page.getByLabel('Peanøtter', { exact: true }).check();
  await page.getByLabel('Sesamfrø', { exact: true }).check();
  await page.getByLabel('Halal', { exact: true }).check();
  await page.locator('input[type=file]').setInputFiles({
    name: 'suya.png',
    mimeType: 'image/png',
    buffer: solidPng(2400, 1600, [150, 90, 40]),
  });
  await expect(page.getByRole('img', { name: 'Bilde av Suya' })).toBeVisible();
  await page.getByRole('button', { name: 'Lagre produktet' }).click();
  await expect(page.getByText('Produktet er opprettet.')).toBeVisible();
  const suya = page.url().match(/products\/([0-9a-f-]{36})/)![1]!;
  const [stored] = await sql<{ price_ore: string; allergens: string; image_path: string }>(
    `select price_ore, allergens::text, image_path from public.products where id = $1`,
    [suya],
  );
  expect(stored).toMatchObject({ price_ore: '15500', allergens: '{peanuts,sesame}' });
  expect(stored!.image_path).toMatch(new RegExp(`^${vendor.vendorId}/products/.+\\.(webp|jpg)$`));

  // Edit the price.
  await page.getByLabel('Pris (kr)').fill('165,50');
  await page.getByRole('button', { name: 'Lagre produktet' }).click();
  await expect(page.getByText('Produktet er lagret.')).toBeVisible();
  const [edited] = await sql<{ price_ore: string }>(
    `select price_ore from public.products where id = $1`,
    [suya],
  );
  expect(edited!.price_ore).toBe('16550');

  const zobo = await newProduct(page, { name: 'Zobo', price: '45', tags: ['Vegansk'] });

  // Duplicate, then reorder with the keyboard-friendly arrow buttons.
  await page.goto('/vendor/products');
  await expect.poll(() => menuNames(page)).toEqual(['Suya', 'Zobo']);
  await page
    .getByTestId('product-row')
    .filter({ hasText: 'Suya' })
    .getByRole('button', { name: 'Kopier' })
    .click();
  await expect(page.getByText('Produktet er kopiert.')).toBeVisible();
  await expect.poll(() => menuNames(page)).toEqual(['Suya', 'Zobo', 'Kopi av Suya']);
  await page.getByRole('button', { name: 'Flytt Zobo opp' }).click();
  await expect.poll(() => menuNames(page)).toEqual(['Zobo', 'Suya', 'Kopi av Suya']);
  await expect
    .poll(async () =>
      (
        await sql<{ name: string }>(
          `select name from public.products where vendor_id = $1 order by sort_order`,
          [vendor.vendorId],
        )
      ).map((r) => r.name),
    )
    .toEqual(['Zobo', 'Suya', 'Kopi av Suya']);
  await expect(axe(page)).resolves.toEqual([]);

  // Per-event availability and sold out (CAT-02).
  await page.getByRole('link', { name: 'Salg på festivalen' }).click();
  await page.getByLabel('Selg Suya på festivalen').check();
  await page.getByLabel('Selg Zobo på festivalen').check();
  await expect(page.getByText('2 av 3 i salg')).toBeVisible();
  await page.getByRole('switch', { name: 'Zobo er utsolgt' }).click();
  await expect(page.getByRole('switch', { name: 'Zobo er utsolgt' })).toBeChecked();
  await expect(axe(page)).resolves.toEqual([]);
  await expect
    .poll(async () =>
      sql<{ product_id: string; is_available: boolean }>(
        `select product_id, is_available from public.product_availability
          where event_id = $1 and vendor_id = $2 order by is_available`,
        [AFFN_2027, vendor.vendorId],
      ),
    )
    .toEqual([
      { product_id: zobo, is_available: false },
      { product_id: suya, is_available: true },
    ]);

  // Preview: only products on sale, in menu order, with allergens spelled out.
  await page.getByRole('link', { name: 'Forhåndsvisning' }).click();
  const items = page.getByTestId('menu-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Zobo');
  await expect(items.nth(0)).toContainText('Utsolgt');
  await expect(items.nth(0).getByTestId('allergens')).toHaveText(
    'Allergener: Inneholder ingen av de 14 allergenene',
  );
  await expect(items.nth(0)).toContainText('Vegansk');
  await expect(items.nth(1)).toContainText('Suya');
  await expect(items.nth(1)).toContainText(/kr\s165,50/);
  await expect(items.nth(1).getByTestId('allergens')).toHaveText('Allergener: Peanøtter, Sesamfrø');
  await expect(items.nth(1).getByRole('img', { name: 'Suya' })).toBeVisible();
  await expect(page.getByText('Kopi av Suya')).toHaveCount(0);
  await expect(axe(page)).resolves.toEqual([]);

  // Archive takes Suya off sale and out of the preview.
  await page.goto('/vendor/products');
  await page
    .getByTestId('product-row')
    .filter({ hasText: /^Suya/ })
    .getByRole('button', { name: 'Arkiver' })
    .click();
  await expect(page.getByText('Produktet er arkivert og tatt ut av salg.')).toBeVisible();
  await page.goto('/vendor/preview');
  await expect(page.getByTestId('menu-item')).toHaveCount(1);
  await page.goto('/vendor/products?show=archived');
  await expect.poll(() => menuNames(page)).toEqual(['Suya']);

  // A product somebody ordered can only be archived; one nobody ordered can be deleted.
  const [order] = await sql<{ id: string }>(
    `insert into public.orders (organization_id, event_id, event_vendor_id, vendor_id, total_ore)
     select organization_id, event_id, id, vendor_id, 4500 from public.event_vendors where id = $1
     returning id`,
    [vendor.eventVendorId],
  );
  await sql(
    `insert into public.order_items (organization_id, event_id, order_id, vendor_id, product_id,
       product_name, unit_price_ore, quantity, line_total_ore)
     select organization_id, event_id, $1, vendor_id, $2, 'Zobo', 4500, 1, 4500
       from public.event_vendors where id = $3`,
    [order!.id, zobo, vendor.eventVendorId],
  );
  await page.goto('/vendor/products');
  const zoboRow = page.getByTestId('product-row').filter({ hasText: 'Zobo' });
  await expect(zoboRow.getByText('Bestilt før – kan bare arkiveres')).toBeVisible();
  await expect(zoboRow.getByRole('button', { name: 'Slett' })).toHaveCount(0);
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByTestId('product-row')
    .filter({ hasText: 'Kopi av Suya' })
    .getByRole('button', { name: 'Slett' })
    .click();
  await expect(page.getByText('Produktet er slettet.')).toBeVisible();
  await expect.poll(() => menuNames(page)).toEqual(['Zobo']);
});

test('profile: story, catering, contact and gallery appear in the preview (VIS-02)', async ({
  page,
}) => {
  const vendor = await approvedVendor('profil');
  await signIn(page, vendor.email, vendor.password);
  await expect(page).toHaveURL(/\/vendor$/);
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();

  await page.getByLabel('Historien din').fill('Bestemors oppskrifter fra Lagos.');
  await page.getByLabel('Telefon').fill('400 00 001');
  await page.getByLabel('Jeg tilbyr catering').check();
  await page.getByLabel('Om cateringtilbudet').fill('Selskap fra 20 personer i Oslo-området.');
  await page.getByRole('button', { name: 'Lagre profilen' }).click();
  await expect(page.getByText('Profilen er lagret.')).toBeVisible();
  await expect(page.getByLabel('Telefon')).toHaveValue('+47 400 00 001');

  await page.getByLabel('Bildegalleri').setInputFiles({
    name: 'bod.png',
    mimeType: 'image/png',
    buffer: solidPng(1600, 1200, [200, 160, 90]),
  });
  await page.getByRole('button', { name: 'Last opp', exact: true }).click();
  await expect(page.getByText('Beskriv bildet.')).toBeVisible();
  await page.getByLabel('Bildebeskrivelse').fill('Boden vår på festivalen');
  await page.getByRole('button', { name: 'Last opp', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Boden vår på festivalen' })).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  await page.getByRole('link', { name: 'Se profilen slik gjestene ser den' }).click();
  await expect(page.getByRole('heading', { name: vendor.name })).toBeVisible();
  await expect(page.getByText('Bestemors oppskrifter fra Lagos.')).toBeVisible();
  await expect(page.getByText('Selskap fra 20 personer i Oslo-området.')).toBeVisible();
  await expect(page.getByRole('link', { name: '+47 400 00 001' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Boden vår på festivalen' })).toBeVisible();
  await expect(page.getByText('Menyen kommer snart.')).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);
});
