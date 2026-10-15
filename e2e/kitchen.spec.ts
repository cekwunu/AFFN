import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { sql } from './support/db';

// Kitchen display and order tracking (ORD-01 … ORD-04): the vendor's kitchen (tablet) and a
// customer's phone stay in sync through every status, the kitchen recovers orders placed while
// it was offline, and cancelling refunds the customer — all in test mode.
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
void defaultBrowserType;

const STOREFRONT = '/e/affn-2027/mama-afrika-kjokken';
const TABLET = { width: 1280, height: 800 };

test.describe.configure({ mode: 'serial' });

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

/** A customer orders and pays on a phone; returns the tracking page, code and token. */
async function placeOrder(browser: Browser, name: string) {
  const context = await browser.newContext(pixel);
  const page = await context.newPage();
  await page.goto(STOREFRONT);
  await page
    .getByTestId('storefront-item')
    .filter({ hasText: 'Zobo' })
    .getByRole('button', { name: /Legg Zobo/ })
    .click();
  await page.getByRole('button', { name: /vare/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Din bestilling' });
  await sheet.getByLabel('Navn (valgfritt)').fill(name);
  await sheet.getByRole('button', { name: /Gå til betaling/ }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await page.getByLabel('Vipps').check();
  await page.getByRole('button', { name: /^Betal kr/ }).click();
  await expect(page).toHaveURL(/\/o\/[0-9a-f]{64}/);
  const code = (await page.getByTestId('order-number').textContent())!.trim();
  const token = page.url().match(/\/o\/([0-9a-f]{64})/)![1]!;
  return { page, code, token, close: () => context.close() };
}

async function openKitchen(browser: Browser) {
  const context = await browser.newContext({ viewport: TABLET });
  const page = await context.newPage();
  await signIn(page, 'vendor@affn.test');
  await expect(page).toHaveURL(/\/vendor$/);
  await page.goto('/vendor/kitchen');
  await expect(page.getByRole('heading', { name: /Kjøkken – Mama Afrika Kjøkken/ })).toBeVisible();
  return { page, close: () => context.close() };
}

const card = (kitchen: Page, code: string) =>
  kitchen.getByTestId('kitchen-order').and(kitchen.locator(`[data-code="${code}"]`));

test('kitchen and customer stay in sync through every status (ORD-01 … ORD-03)', async ({
  browser,
}) => {
  const kitchen = await openKitchen(browser);
  await expect(axe(kitchen.page)).resolves.toEqual([]);
  const customer = await placeOrder(browser, 'Amina');
  // Code: day letter (T outside festival days), stall A1, daily number.
  expect(customer.code).toMatch(/^T·A1-\d{3}$/);
  await expect(customer.page.getByTestId('tracking')).toHaveAttribute('data-status', 'new');
  await expect(
    customer.page.getByRole('heading', { name: 'Bestillingen er mottatt' }),
  ).toBeVisible();
  await expect(customer.page.getByTestId('order-stall')).toHaveText(
    'Stand A1 · Mama Afrika Kjøkken',
  );
  await expect(axe(customer.page)).resolves.toEqual([]);

  // The order appears in New with a visual alert, without reloading the kitchen.
  const order = card(kitchen.page, customer.code);
  await expect(kitchen.page.getByTestId('kitchen-column-new').locator(order)).toBeVisible();
  await expect(order).toHaveAttribute('data-fresh', 'true');
  await expect(order).toContainText('1×Zobo');
  await expect(order).toContainText('Amina');

  const steps = [
    { button: 'Godta', column: 'accepted', heading: 'Kjøkkenet har godtatt bestillingen' },
    { button: 'Start', column: 'preparing', heading: 'Maten lages nå' },
    { button: 'Merk', column: 'ready', heading: 'Klar til henting!' },
  ] as const;
  for (const step of steps) {
    await order.getByRole('button', { name: new RegExp(`^${step.button}`) }).click();
    await expect(
      kitchen.page.getByTestId(`kitchen-column-${step.column}`).locator(order),
    ).toBeVisible();
    await expect(customer.page.getByTestId('tracking')).toHaveAttribute(
      'data-status',
      step.column,
      { timeout: 10_000 },
    );
    await expect(customer.page.getByRole('heading', { name: step.heading })).toBeVisible();
  }
  // Ready: big pickup state with order code and stall.
  await expect(customer.page.getByTestId('order-number')).toHaveText(customer.code);
  await expect(axe(customer.page)).resolves.toEqual([]);

  await order.getByRole('button', { name: `Merk ${customer.code} som hentet` }).click();
  await expect(order).toHaveCount(0);
  await expect(customer.page.getByTestId('tracking')).toHaveAttribute('data-status', 'collected', {
    timeout: 10_000,
  });

  // History lists it as collected.
  await kitchen.page.goto(`/vendor/orders?q=${encodeURIComponent(customer.code)}`);
  const row = kitchen.page.getByTestId('history-row').filter({ hasText: customer.code });
  await expect(row).toContainText('Hentet');
  await expect(axe(kitchen.page)).resolves.toEqual([]);

  await customer.close();
  await kitchen.close();
});

test('the kitchen recovers orders placed while it was offline', async ({ browser }) => {
  const kitchen = await openKitchen(browser);
  await kitchen.page.context().setOffline(true);
  await expect(kitchen.page.getByTestId('kitchen-offline')).toBeVisible();

  const customer = await placeOrder(browser, 'Offline-test');
  await kitchen.page.context().setOffline(false);
  await expect(kitchen.page.getByTestId('kitchen-offline')).toBeHidden({ timeout: 15_000 });
  await expect(
    kitchen.page.getByTestId('kitchen-column-new').locator(card(kitchen.page, customer.code)),
  ).toBeVisible({ timeout: 15_000 });

  // Sold-out toggle on the kitchen display (CAT-02).
  await kitchen.page.goto('/vendor/kitchen');
  await kitchen.page.getByRole('button', { name: /^Utsolgt \(/ }).click();
  const toggle = kitchen.page.getByRole('switch', { name: 'Zobo utsolgt' });
  await toggle.click();
  await expect(kitchen.page.getByText('Zobo er merket utsolgt.')).toBeVisible();
  await expect(customer.page.goto(STOREFRONT)).resolves.toBeTruthy();
  await expect(
    customer.page.getByTestId('storefront-item').filter({ hasText: 'Zobo' }),
  ).toContainText('Utsolgt');
  await toggle.click();
  await expect(kitchen.page.getByText('Zobo er tilbake i salg.')).toBeVisible();

  await customer.close();
  await kitchen.close();
});

test('cancelling a paid order refunds it in full (ORD-04)', async ({ browser }) => {
  const kitchen = await openKitchen(browser);
  const customer = await placeOrder(browser, 'Refusjon');
  const order = card(kitchen.page, customer.code);
  await expect(order).toBeVisible();

  await order.getByRole('button', { name: `Kanseller ${customer.code}` }).click();
  const dialog = kitchen.page.getByRole('dialog', { name: `Kanseller ${customer.code}?` });
  await expect(dialog.getByRole('button', { name: 'Kanseller og refunder' })).toBeDisabled();
  await dialog.getByLabel('Grunn (vises for kunden)').fill('Tomt for zobo');
  await dialog.getByRole('button', { name: 'Kanseller og refunder' }).click();
  await expect(order).toHaveCount(0);

  await expect(customer.page.getByTestId('tracking')).toHaveAttribute('data-status', 'cancelled', {
    timeout: 10_000,
  });
  await expect(customer.page.getByTestId('order-status')).toHaveText(
    'Selgeren har kansellert bestillingen: Tomt for zobo',
  );
  await expect(customer.page.getByTestId('order-refund')).toHaveText(
    /kr\s45,00 er betalt tilbake til deg\./,
  );

  const [refund] = await sql<{ status: string; amount: number; fee: number; payment_fee: number }>(
    `select r.status, r.amount_ore::int as amount, r.platform_fee_reversal_ore::int as fee,
            p.platform_fee_ore::int as payment_fee
       from public.refunds r join public.orders o on o.id = r.order_id
       join public.payments p on p.id = r.payment_id
      where o.tracking_token = $1`,
    [customer.token],
  );
  expect(refund).toMatchObject({ status: 'succeeded', amount: 4_500 });
  expect(refund!.fee).toBe(refund!.payment_fee);

  await customer.close();
  await kitchen.close();
});
