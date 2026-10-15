import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { AFFN_ORG, sql } from './support/db';

// Transaction centre, reconciliation and exports (TRX-01 … TRX-03): the mock provider's report
// reconciles cleanly, injected differences are caught and worked to resolution, and the CSV
// exports use the Norwegian Excel format (semicolon, decimal comma, BOM).
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
void defaultBrowserType;

const CRON_SECRET = 'e2e-cron-secret-0123456789abcdef';

test.describe.configure({ mode: 'serial' });

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

async function buy(browser: Browser) {
  const context = await browser.newContext(pixel);
  const page = await context.newPage();
  await page.goto('/e/affn-2027/mama-afrika-kjokken');
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
  await context.close();
  const [payment] = await sql<{ provider_payment_id: string; amount_ore: string; code: string }>(
    `select p.provider_payment_id, p.amount_ore, o.order_code as code
       from public.payments p join public.orders o on o.id = p.order_id
      where p.status = 'succeeded' order by p.succeeded_at desc limit 1`,
  );
  return payment!;
}

async function asEventAdmin(page: Page) {
  await signIn(page, 'event@affn.test');
  await expect(page).toHaveURL(/\/admin$/);
}

/** Splits a CSV made by toCsv (quoted cells may contain ;). */
function parseCsv(content: string) {
  const rows: string[][] = [];
  for (const line of content.split('\r\n').filter(Boolean)) {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quoted && ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ';' && !quoted) {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    rows.push([...cells, cell]);
  }
  return rows;
}
const kroner = (cell: string) =>
  cell === '' ? 0 : Math.round(Number(cell.replace(',', '.')) * 100);

test.beforeAll(async () => {
  // Start from a clean slate: no injected differences, nothing left open by earlier runs.
  await sql(`delete from public.mock_report_overrides`);
  await sql(
    `update public.reconciliation_items set status = 'resolved', resolution_reason = 'E2E reset'
      where status <> 'resolved'`,
  );
});

test('the scheduled job needs the cron secret and reconciles cleanly', async ({ request }) => {
  expect((await request.get('/api/cron/reconcile')).status()).toBe(401);
  expect(
    (
      await request.get('/api/cron/reconcile', { headers: { authorization: 'Bearer wrong' } })
    ).status(),
  ).toBe(401);
  const response = await request.get('/api/cron/reconcile', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.mismatches).toBe(0);
  expect(result.matched).toBe(result.total);
  expect(result.total).toBeGreaterThan(0);
});

test('injected differences are detected, worked and resolved (TRX-02)', async ({
  page,
  browser,
}) => {
  const sale = await buy(browser);
  // TEST MODE: the provider reports kr 1 more than we took, and a payment we do not know.
  await sql(
    `insert into public.mock_report_overrides (provider_id, organization_id, action, amount_ore)
     values ($1, $2, 'amount', $3), ($4, $2, 'extra', 12300)`,
    [
      sale.provider_payment_id,
      AFFN_ORG,
      Number(sale.amount_ore) + 100,
      `pay_unknown_${Date.now()}`,
    ],
  );

  await asEventAdmin(page);
  await page.goto('/admin/reconciliation');
  await expect(page.getByTestId('no-mismatches')).toBeVisible();
  await page.getByRole('button', { name: 'Kjør nå' }).click();
  await expect(page.getByRole('status')).toContainText('2 avvik');
  const changed = page.locator(
    `[data-testid="mismatch"][data-provider-id="${sale.provider_payment_id}"]`,
  );
  await expect(changed).toHaveAttribute('data-kind', 'amount_differs');
  await expect(changed).toContainText('Beløpet er ulikt');
  await expect(page.getByTestId('mismatch').filter({ hasText: 'Mangler hos oss' })).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // Open mismatches block settlement.
  const [blocking] = await sql<{ n: number }>(
    `select private.unreconciled_count('20000000-0000-4000-8000-000000000001') as n`,
  );
  expect(blocking!.n).toBeGreaterThanOrEqual(2);

  // Assign, comment, resolve with a reason.
  await changed.getByRole('button', { name: 'Tildel' }).click();
  await expect(page.getByText('Avviket er tildelt.')).toBeVisible();
  await expect(changed).toContainText('Tildelt · event@affn.test');
  await changed.getByLabel('Kommentar').fill('Spurt betalingsleverandøren');
  await changed.getByRole('button', { name: 'Legg til' }).click();
  await expect(changed).toContainText('Spurt betalingsleverandøren');
  await changed.getByRole('button', { name: 'Marker som løst' }).click();
  await expect(page.getByText('Skriv en begrunnelse.')).toBeVisible();
  await changed.getByLabel('Begrunnelse').fill('Rapportfeil hos leverandøren, bekreftet');
  await changed.getByRole('button', { name: 'Marker som løst' }).click();
  await expect(page.getByText('Avviket er løst.')).toBeVisible();
  await expect(changed).toHaveCount(0);

  const audit = await sql<{ reason: string | null }>(
    `select a.reason from public.audit_log a join public.reconciliation_items i on i.id::text = a.row_id::text
      where a.table_name = 'reconciliation_items' and i.provider_id = $1
        and a.new_data ->> 'status' = 'resolved'`,
    [sale.provider_payment_id],
  );
  expect(audit.map((a) => a.reason)).toContain('Rapportfeil hos leverandøren, bekreftet');

  await page.getByRole('link', { name: 'Vis løste' }).click();
  await expect(
    page.locator(`[data-testid="mismatch"][data-provider-id="${sale.provider_payment_id}"]`),
  ).toContainText('Rapportfeil hos leverandøren, bekreftet');

  // The provider corrects its report: the next run resolves what no longer differs.
  await sql(`delete from public.mock_report_overrides`);
  await page.goto('/admin/reconciliation');
  await page.getByRole('button', { name: 'Kjør nå' }).click();
  await expect(page.getByRole('status')).toContainText('0 avvik');
  await expect(page.getByTestId('no-mismatches')).toBeVisible();
});

test('the transaction centre finds a payment and shows its ledger (TRX-01)', async ({
  page,
  browser,
}) => {
  const sale = await buy(browser);
  await asEventAdmin(page);
  await page.goto('/admin/transactions');
  await expect(axe(page)).resolves.toEqual([]);
  await page.getByLabel('Søk').fill(sale.code);
  await page.getByLabel('Type').selectOption('payment');
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await expect(page.getByTestId('transaction')).toHaveCount(1);
  await page.getByRole('link', { name: `Åpne detaljer for ${sale.provider_payment_id}` }).click();
  const detail = page.getByTestId('transaction-detail');
  await expect(detail).toContainText(sale.code);
  await expect(detail.getByTestId('tx-ledger')).toContainText('Skyldig leverandør');
  // Raw provider events are for Organization Admins only.
  await expect(detail).toContainText('Ingen (vises bare for organisasjonsadministratorer).');
  await expect(axe(page)).resolves.toEqual([]);
});

test('exports open in Norwegian Excel: semicolons, decimal comma, BOM (TRX-03)', async ({
  page,
}) => {
  await asEventAdmin(page);
  await page.goto('/admin/exports');
  await expect(axe(page)).resolves.toEqual([]);

  const download = async (kind: string) => {
    await page.getByLabel('Hva').selectOption(kind);
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Last ned CSV' }).click(),
    ]);
    expect(file.suggestedFilename()).toMatch(new RegExp(`^affn-${kind}-affn-2027-.*\\.csv$`));
    const content = await readFile((await file.path())!, 'utf8');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    return parseCsv(content.slice(1));
  };

  const transactions = await download('transactions');
  const header = transactions[0]!;
  expect(header).toEqual([
    'Tidspunkt',
    'Type',
    'Status',
    'Leverandør',
    'Org.nr.',
    'Ordre',
    'Referanse hos betalingsleverandør',
    'Betalingsmåte',
    'Beløp',
    'Plattformgebyr',
    'Betalingsgebyr',
    'Id',
  ]);
  const body = transactions.slice(1);
  expect(body.length).toBeGreaterThan(0);
  for (const row of body) {
    expect(row).toHaveLength(header.length);
    expect(row[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(row[8]).toMatch(/^-?\d+,\d{2}$/);
  }
  // Amounts match the database to the øre.
  const payment = body.find((r) => r[1] === 'Betaling' && r[2] === 'succeeded')!;
  const [db] = await sql<{ amount_ore: string }>(
    `select amount_ore from public.payments where id = $1`,
    [payment[11]],
  );
  expect(kroner(payment[8]!)).toBe(Number(db!.amount_ore));

  // Ledger: debits equal credits.
  const ledger = (await download('ledger')).slice(1);
  expect(ledger.length).toBeGreaterThan(0);
  const sum = (column: number) => ledger.reduce((s, r) => s + kroner(r[column]!), 0);
  expect(sum(4)).toBe(sum(5));
  expect(sum(4)).toBeGreaterThan(0);
});
