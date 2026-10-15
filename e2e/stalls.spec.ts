import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { submittedApplicant } from './support/applicants';
import { signIn, signOut } from './support/auth';
import { sql } from './support/db';
import { solidPng } from './support/png';

// Stalls and stall fees (STL-01 … STL-04). Done when a seeded vendor is approved, pays the
// stall fee via the stub, is assigned a stall and sees it on the layout.

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

test('stalls: inventory, CSV import, layout, approval, payment via the stub and the confirmed stall', async ({
  page,
}) => {
  test.slow();
  const prefix = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const applicant = await submittedApplicant('stand');

  await signIn(page, 'event@affn.test');
  await expect(page).toHaveURL(/\/admin$/);

  // STL-01: create one stall, then import two from CSV (Norwegian Excel style).
  await page.getByRole('link', { name: 'Stander' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Stander' })).toBeVisible();
  await page.getByLabel('Nummer', { exact: true }).fill(`${prefix}-1`);
  await page.getByLabel('Område', { exact: true }).fill('Matgata');
  await page.getByLabel('Avgift (kr)', { exact: true }).fill('2 500');
  await page.getByLabel('Strøm', { exact: true }).check();
  await page.getByRole('button', { name: 'Lagre stand' }).click();
  await expect(page.getByText('Standen er lagret.')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: `${prefix}-1` })).toBeVisible();

  const csv = page.getByLabel('CSV', { exact: true });
  await csv.fill(
    `nummer;område;størrelse;bredde_cm;dybde_cm;strøm;vann;premium;avgift_kr\n${prefix}-2;Marked;3 × 3 m;300;300;nei;nei;nei;1 500\n${prefix}-3;Marked;3 × 3 m;300;300;kanskje;nei;nei;1 500`,
  );
  await expect(page.getByText('Linje 3: Skriv ja eller nei.')).toBeVisible();
  await csv.fill(
    `nummer;område;størrelse;bredde_cm;dybde_cm;strøm;vann;premium;avgift_kr\n${prefix}-2;Marked;3 × 3 m;300;300;nei;nei;nei;1 500\n${prefix}-3;Marked;3 × 3 m;300;300;ja;ja;nei;1 500`,
  );
  await page.getByRole('button', { name: 'Importer 2 stander' }).click();
  await expect(page.getByText('2 stander er importert.')).toBeVisible();
  await expect(page.getByRole('rowheader', { name: `${prefix}-3` })).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // STL-03: venue image and a pin for stall 1.
  await page.getByRole('link', { name: 'Kart', exact: true }).click();
  await page.getByLabel(/Last opp kart over området|Bytt kart/).setInputFiles({
    name: 'kart.png',
    mimeType: 'image/png',
    buffer: solidPng(800, 400, [232, 224, 210]),
  });
  await expect(page.getByText('Kartet er lastet opp.')).toBeVisible();
  const map = page.getByRole('img', { name: 'Kart over festivalområdet' });
  await expect(map).toBeVisible();
  await page.getByLabel('Stand å plassere').selectOption({ label: `${prefix}-1 (ikke plassert)` });
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.25, y: box.height * 0.5 } });
  await expect(page.getByTestId('selected-pin')).toHaveText(`${prefix}-1`);
  await page.getByRole('button', { name: 'Lagre plassering' }).click();
  await expect(page.getByText('Plasseringen er lagret.')).toBeVisible();
  const [pin] = await sql<{ map_x: number; map_y: number }>(
    'select map_x, map_y from public.stalls where number = $1',
    [`${prefix}-1`],
  );
  expect(pin!.map_x).toBeGreaterThan(2400);
  expect(pin!.map_x).toBeLessThan(2600);
  expect(pin!.map_y).toBeGreaterThan(4900);
  expect(pin!.map_y).toBeLessThan(5100);
  await page.reload();
  await expect(page.getByTestId('selected-pin')).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // REV-02: approval creates the stall fee invoice.
  await page.goto(`/admin/applications/${applicant.eventVendorId}`);
  await page.getByRole('radio', { name: 'Godkjenn' }).check();
  await page.getByLabel('Notat', { exact: true }).fill('Velkommen!');
  await page.getByRole('button', { name: 'Velg handling' }).click();
  await expect(page.getByTestId('review-status')).toHaveText('Godkjent');

  // STL-02: assign, with the power conflict flagged for a stall without power.
  await page.goto('/admin/stalls/assign?needs=power');
  const row = page.getByTestId('assign-vendor').filter({ hasText: applicant.name });
  await expect(row.getByText('Standavgift: ikke betalt')).toBeVisible();
  const select = row.getByLabel(`Stand for ${applicant.name}`);
  await select.selectOption({ label: `${prefix}-2 · Marked ⚠` });
  await expect(row.getByText('Standen har ikke strøm')).toBeVisible();
  await select.selectOption({ label: `${prefix}-1 · Matgata` });
  await expect(row.getByText('Standen har ikke strøm')).toBeHidden();
  await expect(axe(page)).resolves.toEqual([]);
  await row.getByRole('button', { name: 'Tildel' }).click();
  await expect(page.getByText('Standen er tildelt.')).toBeVisible();
  const audit = await sql<{ count: string }>(
    `select count(*) from public.audit_log a join public.stall_assignments s on s.id::text = a.row_id::text
      where a.table_name = 'stall_assignments' and s.event_vendor_id = $1`,
    [applicant.eventVendorId],
  );
  expect(Number(audit[0]!.count)).toBeGreaterThanOrEqual(1);
  await signOut(page);

  // STL-04: the vendor sees no stall until the fee is paid, pays via the stub, then sees it.
  await signIn(page, applicant.email, applicant.password);
  await expect(page).toHaveURL(/\/vendor$/);
  await page.getByRole('link', { name: 'Stand', exact: true }).click();
  await expect(
    page.getByText('Standplassen din bekreftes når standavgiften er betalt.'),
  ).toBeVisible();
  await expect(page.getByText(`${prefix}-1`)).toHaveCount(0);
  await expect(page.getByText(/kr\s3\s125,00/)).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);
  await page.getByRole('button', { name: 'Betal standavgiften' }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await expect(page.getByText('TESTMODUS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Betal kr\s3\s125,00$/ }).click();

  await expect(page).toHaveURL(/\/vendor\/stall\?paid=1$/);
  await expect(page.getByRole('heading', { name: `Stand ${prefix}-1 er bekreftet` })).toBeVisible();
  await expect(page.getByText('Matgata')).toBeVisible();
  await expect(page.getByRole('img', { name: /din stand markert/ })).toBeVisible();
  await expect(page.getByTestId('my-stall-pin')).toHaveText(`Stand ${prefix}-1`);
  await expect(page.getByText(`${prefix}-2`)).toHaveCount(0);
  await expect(axe(page)).resolves.toEqual([]);

  // AFFN revenue: one fee payment, invoice paid, nothing in the vendor ledger.
  const [money] = await sql<{ payments: string; invoice: string; ledger: string }>(
    `select (select count(*) from public.fee_payments p join public.stall_fees f on f.id = p.stall_fee_id
              where f.event_vendor_id = $1) as payments,
            (select i.status from public.invoices i join public.stall_fees f on f.id = i.stall_fee_id
              where f.event_vendor_id = $1) as invoice,
            (select count(*) from public.ledger_entries where vendor_id = $2) as ledger`,
    [applicant.eventVendorId, applicant.vendorId],
  );
  expect(money).toEqual({ payments: '1', invoice: 'paid', ledger: '0' });
});
