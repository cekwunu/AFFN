import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { sql } from './support/db';
import { signIn } from './support/auth';
import { waitForEmail } from './support/mailpit';

// QR storefront and checkout (QR-01 … QR-05) on a phone, in test mode. Seeded vendor
// "Mama Afrika Kjøkken" sells at AFFN 2027 at 10 % + mva; payouts are enabled.
// Pixel 7 runs on Chromium here; its defaultBrowserType cannot be set inside a describe block.
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
void defaultBrowserType;
test.use(pixel);

const STOREFRONT = '/e/affn-2027/mama-afrika-kjokken';
const EVENT_VENDOR = '41000000-0000-4000-8000-000000000001';

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

const item = (page: Page, name: string) =>
  page.getByTestId('storefront-item').filter({ hasText: name });

async function fillCart(page: Page) {
  await page.goto(STOREFRONT);
  await item(page, 'Jollof-ris med kylling')
    .getByRole('button', { name: /Legg Jollof-ris/ })
    .click();
  await item(page, 'Jollof-ris med kylling')
    .getByRole('button', { name: /Legg til én Jollof-ris/ })
    .click();
  await item(page, 'Zobo')
    .getByRole('button', { name: /Legg Zobo/ })
    .click();
}

test.describe.configure({ mode: 'serial' });

test('scan → pay → receipt on a phone (QR-02, QR-03, QR-05)', async ({ page }) => {
  await page.goto(STOREFRONT);
  await expect(page.getByRole('heading', { level: 1, name: 'Mama Afrika Kjøkken' })).toBeVisible();
  // The menu starts within the first screen, without scrolling past the hero.
  const first = await page.getByTestId('storefront-item').first().boundingBox();
  expect(first!.y).toBeLessThan(page.viewportSize()!.height);
  await expect(item(page, 'Suya-spyd')).toContainText('Allergener: Peanøtter');
  await expect(axe(page)).resolves.toEqual([]);

  await fillCart(page);
  const bar = page.getByRole('button', { name: /3 varer/ });
  await expect(bar).toContainText(/Se bestillingen · kr\s415,00/);
  await bar.click();
  const sheet = page.getByRole('dialog', { name: 'Din bestilling' });
  await expect(sheet.getByTestId('cart-total')).toHaveText(/kr\s415,00/);
  await sheet.getByLabel('Navn (valgfritt)').fill('Kari');
  await sheet.getByLabel('Beskjed til kjøkkenet (valgfritt)').fill('Bord 4');
  await expect(sheet.getByText('TESTMODUS – ingen ekte betaling')).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);
  await sheet.getByRole('button', { name: /Gå til betaling · kr\s415,00/ }).click();

  // The mock provider's payment page shows the split; checked against the rule below.
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await expect(page.getByText('TESTMODUS', { exact: true })).toBeVisible();
  const shownFee = (await page.getByText(/^Plattformgebyr \(provisjon \+ mva\):/).textContent())!;
  const shownVendor = (await page.getByText(/^Til leverandøren:/).textContent())!;
  await page.getByLabel('Vipps').check();
  await page.getByRole('button', { name: /^Betal kr\s415,00$/ }).click();

  await expect(page).toHaveURL(/\/o\/[0-9a-f]{64}\?paid=1$/);
  await expect(page.getByRole('heading', { name: 'Bestillingen er mottatt' })).toBeVisible();
  const receipt = page.getByTestId('receipt');
  await expect(receipt).toContainText('Mama Afrika Kjøkken Okafor, Org.nr. 912345670');
  await expect(receipt).toContainText('African Food Festival Norway formidler bestillingen');
  await expect(receipt).toContainText('Jollof-ris med kylling');
  await expect(receipt.getByTestId('receipt-total')).toHaveText(/kr\s415,00/);
  await expect(receipt).toContainText('Betalt med: Vipps');
  await expect(receipt).toContainText('Selgeren er ikke mva-registrert.');
  await expect(axe(page)).resolves.toEqual([]);

  const token = page.url().match(/\/o\/([0-9a-f]{64})/)![1]!;
  const [order] = await sql<Record<string, string | number | null>>(
    `select o.status, o.customer_name, o.pickup_note, o.total_ore::int, o.commission_type,
            o.commission_rate_bp, o.commission_ore::int, o.commission_mva_ore::int,
            o.platform_fee_ore::int, p.platform_fee_ore::int as payment_fee,
            p.amount_ore::int as payment_amount, p.status as payment_status, p.method
       from public.orders o join public.payments p on p.order_id = o.id
      where o.tracking_token = $1`,
    [token],
  );
  expect(order).toMatchObject({
    status: 'new',
    customer_name: 'Kari',
    pickup_note: 'Bord 4',
    total_ore: 41_500,
    commission_type: 'percentage',
    payment_amount: 41_500,
    payment_status: 'succeeded',
    method: 'vipps',
  });
  // Commission and its 25 % mva follow the snapshotted rule to the øre (half-up), and the
  // payment withholds exactly commission + mva.
  const half = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));
  const commission = half(41_500 * Number(order!.commission_rate_bp), 10_000);
  const mva = half(commission * 2_500, 10_000);
  expect(order!.commission_ore).toBe(commission);
  expect(order!.commission_mva_ore).toBe(mva);
  expect(order!.platform_fee_ore).toBe(commission + mva);
  expect(order!.payment_fee).toBe(commission + mva);
  const kr = (o: number) => `${Math.floor(o / 100)},${String(o % 100).padStart(2, '0')}`;
  expect(shownFee.replace(/\s/g, ' ')).toContain(kr(commission + mva));
  expect(shownVendor.replace(/\s/g, ' ')).toContain(kr(41_500 - commission - mva));

  // An emailed copy of the receipt.
  const email = `kvittering-${Date.now()}@example.test`;
  await page.getByLabel('E-postadresse').fill(email);
  await page.getByRole('button', { name: 'Send kvittering' }).click();
  await expect(page.getByText(`Kvitteringen er sendt til ${email}.`)).toBeVisible();
  const mail = await waitForEmail(email, { subject: 'Kvittering fra Mama Afrika Kjøkken' });
  expect(mail.text).toContain('912345670');
  expect(mail.text).toMatch(/Totalt\s+kr\s415,00/);
});

test('a declined payment keeps the cart and shows a clear message (QR-03)', async ({ page }) => {
  await fillCart(page);
  await page.getByRole('button', { name: /varer/ }).click();
  await page
    .getByRole('dialog', { name: 'Din bestilling' })
    .getByRole('button', { name: /Gå til betaling/ })
    .click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await page.getByRole('button', { name: 'Simuler avvist betaling' }).click();

  await expect(page).toHaveURL(/\/e\/affn-2027\/mama-afrika-kjokken\?payment=failed$/);
  await expect(page.getByText(/^Betalingen gikk ikke gjennom/)).toBeVisible();
  // The cart survived the trip to the payment page.
  await expect(page.getByRole('button', { name: /varer/ })).toBeVisible();
  const [latest] = await sql<{ status: string; payment: string }>(
    `select o.status, p.status as payment from public.orders o join public.payments p on p.order_id = o.id
      where o.event_vendor_id = $1 order by o.created_at desc limit 1`,
    [EVENT_VENDOR],
  );
  expect(latest).toEqual({ status: 'cancelled', payment: 'failed' });
});

test('a paused vendor shows its status and cannot take orders (QR-04)', async ({ page }) => {
  await sql(`update public.event_vendors set is_paused = true where id = $1`, [EVENT_VENDOR]);
  try {
    await page.goto(STOREFRONT);
    await expect(page.getByText(/tar ikke imot bestillinger akkurat nå/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Legg .* i handlekurven/ })).toHaveCount(0);
    await expect(page.getByTestId('storefront-item').first()).toBeVisible();
  } finally {
    await sql(`update public.event_vendors set is_paused = false where id = $1`, [EVENT_VENDOR]);
  }
});

test('the vendor downloads the QR code and table sign (QR-01)', async ({ page, request }) => {
  await signIn(page, 'vendor@affn.test');
  await expect(page).toHaveURL(/\/vendor$/);
  await page.goto('/vendor/qr');
  await expect(page.getByTestId('storefront-url')).toHaveText(
    /\/e\/affn-2027\/mama-afrika-kjokken$/,
  );
  await expect(page.getByRole('img', { name: /QR-kode til/ })).toBeVisible();
  const cookies = await page.context().cookies();
  const headers = { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
  const png = await request.get('/api/vendor/qr/png', { headers });
  expect(png.headers()['content-type']).toBe('image/png');
  const pdf = await request.get('/api/vendor/qr/pdf', { headers });
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const anonymous = await request.get('/api/vendor/qr/pdf', { headers: { cookie: '' } });
  expect(anonymous.status()).toBe(403);
});
