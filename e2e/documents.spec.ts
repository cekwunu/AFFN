import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { sql } from './support/db';
import { pdfText } from './support/pdf';
import { freshTotp, SEED_TOTP_SECRET } from './support/totp';

// Organization settings (AFFN's company details on its documents) and the customer receipt PDF
// (QR-05), stored once per content.
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
void defaultBrowserType;

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

test('the Organization Admin keeps AFFN’s company details; a wrong org number is refused', async ({
  page,
}) => {
  await signIn(page, 'admin@affn.test');
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByLabel('Kode fra appen').fill(await freshTotp(SEED_TOTP_SECRET));
  await page.getByRole('button', { name: 'Bekreft' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/settings');
  await expect(page.getByLabel('Juridisk navn')).toHaveValue('African Food Festival Norway AS');
  await expect(axe(page)).resolves.toEqual([]);

  await page.getByLabel('Organisasjonsnummer').fill('923 456 780');
  await page.getByLabel('Poststed').fill('Oslo sentrum');
  await page.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByText('Organisasjonsnummeret er ikke gyldig.')).toBeVisible();
  // The typed values stay.
  await expect(page.getByLabel('Poststed')).toHaveValue('Oslo sentrum');
  await page.getByLabel('Poststed').fill('Oslo');
  await page.getByLabel('Organisasjonsnummer').fill('987 654 325');
  await page.getByRole('button', { name: 'Lagre' }).click();
  await expect(page.getByText('Innstillingene er lagret.')).toBeVisible();
  const [audit] = await sql<{ n: number }>(
    `select count(*)::int as n from public.audit_log where table_name = 'organizations'
      and new_data ->> 'city' = 'Oslo'`,
  );
  expect(audit!.n).toBeGreaterThanOrEqual(1);
});

test('the customer downloads the receipt as PDF; unchanged content is stored once', async ({
  browser,
}) => {
  const context = await browser.newContext(pixel);
  const page = await context.newPage();
  await page.goto('/e/affn-2027/jollof-house-oslo');
  await page
    .getByRole('button', { name: /^Legg .* i handlekurven$/ })
    .first()
    .click();
  await page.getByRole('button', { name: /vare/ }).click();
  await page
    .getByRole('dialog', { name: 'Din bestilling' })
    .getByRole('button', { name: /Gå til betaling/ })
    .click();
  await page.getByLabel('Vipps').check();
  await page.getByRole('button', { name: /^Betal kr/ }).click();
  await expect(page).toHaveURL(/\/o\/[0-9a-f]{64}/);
  const href = (await page.getByTestId('receipt-pdf').getAttribute('href'))!;
  const first = await page.request.get(href);
  expect(first.headers()['content-type']).toBe('application/pdf');
  const text = await pdfText(await first.body());
  for (const field of [
    'Kvittering',
    'Jollof House',
    'Org.nr.',
    'Betalt med Vipps',
    'Totalt betalt',
  ]) {
    expect(text).toContain(field);
  }
  const again = await page.request.get(href);
  expect(again.headers()['x-document-version']).toBe(first.headers()['x-document-version']);
  const english = await page.request.get(`${href}?lang=en`);
  expect(await pdfText(await english.body())).toContain('Receipt');
  await context.close();
});
