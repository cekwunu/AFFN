import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { sql } from './support/db';
import { freshTotp, SEED_TOTP_SECRET } from './support/totp';

// Commission settings and ledger (COM-01 … COM-03, PRD §5–6): the Organization Admin adds a
// vendor rate with a reason and a live example; a paid order lands in the ledger, and the
// admin's ledger totals equal the order totals.
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
void defaultBrowserType;

test.describe.configure({ mode: 'serial' });

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

async function asOrgAdmin(page: Page) {
  await signIn(page, 'admin@affn.test');
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByLabel('Kode fra appen').fill(await freshTotp(SEED_TOTP_SECRET));
  await page.getByRole('button', { name: 'Bekreft' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function payOrder(browser: Browser) {
  const context = await browser.newContext(pixel);
  const page = await context.newPage();
  await page.goto('/e/affn-2027/mama-afrika-kjokken');
  await page
    .getByTestId('storefront-item')
    .filter({ hasText: 'Jollof-ris med kylling' })
    .getByRole('button', { name: /Legg Jollof-ris/ })
    .click();
  await page.getByRole('button', { name: /vare/ }).click();
  await page
    .getByRole('dialog', { name: 'Din bestilling' })
    .getByRole('button', { name: /Gå til betaling/ })
    .click();
  await page.getByLabel('Kort').check();
  await page.getByRole('button', { name: /^Betal kr/ }).click();
  await expect(page).toHaveURL(/\/o\/[0-9a-f]{64}/);
  const token = page.url().match(/\/o\/([0-9a-f]{64})/)![1]!;
  await context.close();
  return token;
}

test('the Organization Admin adds a vendor rate with a reason and a live example (COM-01, COM-03)', async ({
  page,
}) => {
  await asOrgAdmin(page);
  await page.goto('/admin/commission');
  await expect(page.getByRole('heading', { level: 1, name: 'Provisjon' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gjelder nå for AFFN 2027' })).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Lagre sats' }) });
  await form.getByLabel('Leverandør', { exact: true }).check();
  await form
    .getByRole('combobox', { name: 'Leverandør' })
    .selectOption({ label: 'Mama Afrika Kjøkken' });
  await form.getByLabel('Prosent', { exact: true }).fill('8');
  // Live example, recalculated as the admin types.
  await expect(page.getByTestId('commission-example')).toHaveText(
    /salg på kr\s500 → provisjon kr\s40,00 \+ mva kr\s10,00 → leverandøren får kr\s450,00/,
  );
  await form.getByLabel('Prosent', { exact: true }).fill('8,5');
  await expect(page.getByTestId('commission-example')).toContainText('kr 446,87'.replace(' ', ' '));

  // A reason is required.
  await form.getByRole('button', { name: 'Lagre sats' }).click();
  await expect(form.getByText('Skriv en begrunnelse.')).toBeVisible();
  // What was entered stays after the refused submit.
  await expect(form.getByRole('combobox', { name: /^Leverandør/ })).toHaveValue(/.+/);
  await expect(form.getByLabel('Prosent', { exact: true })).toHaveValue('8,5');

  const reason = `Kampanjesats ${Date.now()}`;
  await form.getByLabel('Begrunnelse (lagres i revisjonsloggen)').fill(reason);
  await form.getByRole('button', { name: 'Lagre sats' }).click();
  await expect(page.getByText('Satsen er lagret.')).toBeVisible();
  const row = page.getByTestId('rule-row').filter({ hasText: reason });
  await expect(row).toContainText('Mama Afrika Kjøkken');
  await expect(row).toContainText(/8,5\s%\s\+\smva/);

  const [audit] = await sql<{ reason: string }>(
    `select reason from public.audit_log where table_name = 'commission_rules'
      order by created_at desc limit 1`,
  );
  expect(audit!.reason).toBe(reason);
});

test('a paid order is in the ledger and the admin totals match the orders (COM-02)', async ({
  page,
  browser,
}) => {
  const token = await payOrder(browser);
  const [order] = await sql<{ rate: number; commission: number; mva: number; total: number }>(
    `select commission_rate_bp as rate, commission_ore::int as commission,
            commission_mva_ore::int as mva, total_ore::int as total
       from public.orders where tracking_token = $1`,
    [token],
  );
  // The new 8,5 % vendor rate is snapshotted on the order: kr 185 → 15,73 + 3,93.
  expect(order).toEqual({ rate: 850, commission: 1_573, mva: 393, total: 18_500 });
  const lines = await sql<{ account: string; direction: string; amount: number }>(
    `select e.account, e.direction, e.amount_ore::int as amount
       from public.ledger_entries e join public.orders o on o.id = e.order_id
      where o.tracking_token = $1`,
    [token],
  );
  const key = (l: { account: string; direction: string }) => `${l.account}:${l.direction}`;
  expect(lines.sort((a, b) => key(a).localeCompare(key(b)))).toEqual([
    { account: 'commission_revenue', direction: 'credit', amount: 1_573 },
    { account: 'mva_payable', direction: 'credit', amount: 393 },
    { account: 'psp_clearing', direction: 'credit', amount: 463 },
    { account: 'psp_clearing', direction: 'debit', amount: 18_500 },
    { account: 'psp_fee_expense', direction: 'debit', amount: 463 },
    { account: 'vendor_payable', direction: 'credit', amount: 16_534 },
  ]);

  await asOrgAdmin(page);
  await page.goto('/admin/ledger');
  await expect(page.getByTestId('ledger-match')).toHaveAttribute('data-match', 'true');
  for (const row of ['grossOre', 'refundedOre', 'platformFeeOre', 'pspFeeOre', 'vendorOre']) {
    const cells = page.getByTestId(`total-${row}`);
    await expect(cells.locator('[data-source="ledger"]')).toHaveText(
      (await cells.locator('[data-source="orders"]').textContent())!,
    );
  }
  await expect(axe(page)).resolves.toEqual([]);
});

test('the vendor sees its balance from the ledger', async ({ page }) => {
  await signIn(page, 'vendor@affn.test');
  await expect(page).toHaveURL(/\/vendor$/);
  await page.goto('/vendor/payouts');
  const [balance] = await sql<{ pending: number }>(
    `select pending_ore::int as pending from public.vendor_balances('20000000-0000-4000-8000-000000000001')
      where vendor_id = '40000000-0000-4000-8000-000000000001'`,
  );
  const kr = (o: number) =>
    `kr ${Math.floor(o / 100)
      .toLocaleString('nb-NO')
      .replace(/\s/g, ' ')},${String(o % 100).padStart(2, '0')}`;
  await expect(page.getByTestId('balance-pending')).toHaveText(kr(balance!.pending));
  await expect(axe(page)).resolves.toEqual([]);
});
