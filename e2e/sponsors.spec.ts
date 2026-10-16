import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { sql } from './support/db';
import { pdfText } from './support/pdf';
import { solidPng } from './support/png';

// Sponsors (SPO-01 … SPO-04): a seeded sponsor sign-up registers, AFFN approves (invoice), the
// sponsor uploads a logo that AFFN approves (shown on the site), QR scans and clicks are counted
// without personal data, and the report adds up.
test.describe.configure({ mode: 'serial' });

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
// Unique per run, so the spec can run again on the same database.
const SPONSOR = `Solskinn Energi ${Date.now() % 100_000}`;

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

async function asSponsor(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, 'newsponsor@affn.test');
  await expect(page).toHaveURL(/\/sponsor(\/register)?$/);
  return { page, context };
}

async function asEventAdmin(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, 'event@affn.test');
  await expect(page).toHaveURL(/\/admin$/);
  return { page, context };
}

let sponsorshipPath = '';

test.beforeAll(async () => {
  // A clean start for the seeded sign-up (earlier runs registered it).
  await sql(
    `update public.memberships set status = 'pending', sponsor_id = null
      where user_id = '00000000-0000-4000-8000-000000000007' and role = 'sponsor'`,
  );
});

test('the public page lists the packages from the database', async ({ page }) => {
  await page.goto('/become-a-sponsor');
  const packages = page.getByTestId('package');
  await expect(packages.filter({ hasText: 'Gull' })).toContainText('kr 150 000,00');
  await expect(packages.filter({ hasText: 'Gull' })).toContainText('2 sporbare QR-koder');
  await expect(axe(page)).resolves.toEqual([]);
});

test('a signed-up sponsor registers the company (Brønnøysund check) and chooses a package', async ({
  browser,
}) => {
  const { page, context } = await asSponsor(browser);
  await page.goto('/sponsor');
  await expect(page).toHaveURL(/\/sponsor\/register$/);
  await expect(axe(page)).resolves.toEqual([]);
  await page.getByLabel('Gull').check();
  await page.getByLabel('Organisasjonsnummer').fill('910000004'); // not in the registry
  await page.getByLabel(/^Navn slik det skal vises/).fill(SPONSOR);
  await page.getByLabel(/^Nettside/).fill('https://solskinn.example');
  await page.getByLabel('Navn', { exact: true }).fill('Kari Nordmann');
  await page.getByLabel('E-post for faktura').fill('faktura@solskinn.example');
  await page.getByRole('button', { name: 'Send registreringen' }).click();
  await expect(page.getByText('Fant ikke organisasjonsnummeret')).toBeVisible();
  await page.getByLabel('Organisasjonsnummer').fill('923 456 783');
  await page.getByRole('button', { name: 'Send registreringen' }).click();
  await expect(page).toHaveURL(/\/sponsor\?notice=registered$/);
  await expect(page.getByTestId('sponsorship')).toHaveAttribute('data-status', 'inquiry');
  await expect(axe(page)).resolves.toEqual([]);
  await context.close();
});

test('AFFN approves: invoice with 25 % mva, QR codes and a tracked link', async ({ browser }) => {
  const { page, context } = await asEventAdmin(browser);
  await page.goto('/admin/sponsors');
  await expect(axe(page)).resolves.toEqual([]);
  await page
    .getByTestId('sponsorship-row')
    .filter({ hasText: SPONSOR })
    .first()
    .getByRole('link', { name: SPONSOR })
    .click();
  await expect(page).toHaveURL(/\/admin\/sponsors\/[0-9a-f-]{36}$/);
  sponsorshipPath = new URL(page.url()).pathname;
  await page.getByLabel('Notat (påkrevd, logges)').fill('Velkommen som hovedsponsor');
  await page.getByRole('button', { name: 'Godkjenn og send faktura' }).click();
  await expect(page.getByText('Sponsoratet er godkjent, og fakturaen er laget.')).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);
  await context.close();

  const sponsor = await asSponsor(browser);
  await expect(sponsor.page.getByTestId('sponsorship')).toHaveAttribute('data-status', 'invoiced');
  await expect(sponsor.page.getByTestId('sponsor-link')).toHaveCount(3); // 2 QR codes + 1 link
  const invoice = await sponsor.page.request.get(
    (await sponsor.page.getByRole('link', { name: 'Faktura (PDF)' }).getAttribute('href'))!,
  );
  const text = await pdfText(await invoice.body());
  for (const field of [
    'Faktura',
    'Sponsorpakke Gull',
    'Mva 25 %',
    'kr 187 500,00',
    'Kontonummer',
  ]) {
    expect(text).toContain(field);
  }
  await sponsor.context.close();
});

test('the sponsor uploads a logo; AFFN approves it and it shows on the site', async ({
  browser,
}) => {
  const sponsor = await asSponsor(browser);
  await sponsor.page.getByLabel('Fil').setInputFiles({
    name: 'solskinn.png',
    mimeType: 'image/png',
    buffer: solidPng(400, 200, [230, 160, 40]),
  });
  await sponsor.page.getByRole('button', { name: 'Last opp', exact: true }).click();
  await expect(
    sponsor.page.getByText('Filen er lastet opp og venter på godkjenning.'),
  ).toBeVisible();
  await expect(sponsor.page.getByTestId('sponsor-asset').first()).toHaveAttribute(
    'data-status',
    'pending',
  );
  await sponsor.context.close();

  const admin = await asEventAdmin(browser);
  await admin.page.goto(sponsorshipPath);
  const asset = admin.page.getByTestId('asset').first();
  await asset.getByLabel('Tilbakemelding til sponsoren').fill('Fin logo!');
  await asset.getByRole('button', { name: 'Godkjenn' }).click();
  await expect(admin.page.getByText('Materiellet er godkjent.')).toBeVisible();
  await admin.context.close();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto('/sponsors');
  await expect(
    visitor.getByTestId('sponsor-logos').getByRole('img', { name: SPONSOR }),
  ).toBeVisible();
  // The sponsor's own page counts a view (no personal data).
  await visitor.getByRole('link', { name: SPONSOR }).click();
  await expect(visitor.getByRole('heading', { level: 1, name: SPONSOR })).toBeVisible();
  await expect(axe(visitor)).resolves.toEqual([]);
  await visitorContext.close();
});

test('QR scans and clicks are counted without personal data; the report adds up (SPO-03, SPO-04)', async ({
  browser,
  request,
}) => {
  const sponsor = await asSponsor(browser);
  const links = sponsor.page.getByTestId('sponsor-link');
  const qr = (await links.nth(0).getAttribute('data-slug'))!;
  const link = (await links.nth(2).getAttribute('data-slug'))!;
  for (let i = 0; i < 3; i++) {
    const response = await request.get(`/s/${qr}`, {
      maxRedirects: 0,
      headers: { 'user-agent': MOBILE_UA },
    });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('https://solskinn.example/');
    expect(response.headers()['set-cookie']).toBeUndefined();
  }
  for (let i = 0; i < 2; i++) {
    expect((await request.get(`/s/${link}`, { maxRedirects: 0 })).status()).toBe(302);
  }
  // Only the time and a coarse device type are stored.
  const scans = await sql<{ device_class: string }>(
    `select q.device_class from public.qr_scans q join public.tracked_links l on l.id = q.tracked_link_id
      where l.slug = $1`,
    [qr],
  );
  expect(scans.map((s) => s.device_class)).toEqual(['mobile', 'mobile', 'mobile']);

  await sponsor.page.reload();
  await expect(links.nth(0).getByTestId('link-hits')).toHaveText('3 skanninger');
  await expect(links.nth(2).getByTestId('link-hits')).toHaveText('2 klikk');

  const csv = await sponsor.page.request.get(
    (await sponsor.page.getByRole('link', { name: 'Tall (CSV)' }).getAttribute('href'))!,
  );
  const lines = (await csv.text()).replace(/^﻿/, '').split('\r\n');
  expect(lines[0]).toBe('Periode;Når;QR-skanninger;Klikk;Sidevisninger');
  expect(lines).toContain('Totalt;;3;2;1');
  const [festival] = await sql<{ orders: number }>(
    `select count(*)::int as orders from public.orders
      where event_id = '20000000-0000-4000-8000-000000000001' and paid_at is not null`,
  );
  expect(lines).toContain(`Festivalen: betalte bestillinger;;${festival!.orders};;`);
  const pdf = await sponsor.page.request.get(
    (await sponsor.page.getByRole('link', { name: 'Rapport (PDF)' }).getAttribute('href'))!,
  );
  const text = await pdfText(await pdf.body());
  for (const field of ['Sponsorrapport', SPONSOR, 'Gull', 'QR-skanninger 3', 'Klikk på lenker 2']) {
    expect(text).toContain(field);
  }
  await expect(axe(sponsor.page)).resolves.toEqual([]);
  await sponsor.context.close();
});
