import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { AFFN_2027, sql } from './support/db';
import { freshTotp, SEED_TOTP_SECRET } from './support/totp';

// Settlement engine (SET-01 … SET-05): a batch is blocked until fixed, an adjustment and the batch
// are approved by someone else (four eyes), a failed payout is retried, and the amounts paid out
// equal the ledger to the øre.
const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
void defaultBrowserType;

const JOLLOF = '41000000-0000-4000-8000-000000000002';

test.describe.configure({ mode: 'serial' });

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
    .then((r) => r.violations.map((v) => v.id));

async function buy(browser: Browser, slug: string) {
  const context = await browser.newContext(pixel);
  const page = await context.newPage();
  await page.goto(`/e/affn-2027/${slug}`);
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
}

async function asEventAdmin(page: Page) {
  await signIn(page, 'event@affn.test');
  await expect(page).toHaveURL(/\/admin$/);
}

async function asOrgAdmin(page: Page) {
  await signIn(page, 'admin@affn.test');
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByLabel('Kode fra appen').fill(await freshTotp(SEED_TOTP_SECRET));
  await page.getByRole('button', { name: 'Bekreft' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

let batchUrl = '';

test('a batch is blocked until its problems are fixed (SET-02)', async ({ page, browser }) => {
  await buy(browser, 'mama-afrika-kjokken');
  await buy(browser, 'jollof-house-oslo');
  // Earlier open batches from other runs would hold these vendors back.
  await sql(
    `update public.settlements set status = 'cancelled' where status in ('draft', 'prepared')`,
  );

  await asEventAdmin(page);
  await page.goto('/admin/settlements');
  await expect(axe(page)).resolves.toEqual([]);
  const notes = `E2E ${Date.now()}`;
  await page.getByLabel('Navn eller notat (valgfritt)').fill(notes);
  await page.getByRole('button', { name: 'Lag oppgjør' }).click();
  await expect(page.getByText('Oppgjøret er laget.')).toBeVisible();
  batchUrl = new URL(page.url()).pathname;
  await expect(
    page.getByTestId('settlement-line').filter({ hasText: 'Jollof House Oslo' }),
  ).toBeVisible();
  await expect(page.getByTestId('no-blockers')).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // The PSP reports a dispute on Jollof House's latest order (test mode).
  await page
    .getByTestId('settlement-line')
    .filter({ hasText: 'Jollof House Oslo' })
    .getByRole('button', { name: 'Simuler innsigelse' })
    .click();
  const blocker = page.getByTestId('blockers').locator('[data-kind="dispute"]');
  await expect(blocker).toContainText('Jollof House Oslo har en åpen innsigelse');
  await expect(blocker.getByRole('link', { name: 'Se leverandøren' })).toBeVisible();
  await page.getByRole('button', { name: 'Send til godkjenning' }).click();
  await expect(page.getByText('Oppgjøret kan ikke sendes videre')).toBeVisible();

  // Won: the blocker goes away.
  await blocker.getByRole('button', { name: 'Testmodus: innsigelsen vunnet' }).click();
  await expect(page.getByTestId('no-blockers')).toBeVisible();

  // A credit adjustment for Mama Afrika, awaiting approval.
  const adjustments = page.locator('#adjustments');
  await adjustments.getByLabel('Leverandør').selectOption({ label: 'Mama Afrika Kjøkken' });
  await adjustments.getByLabel('Beløp (kr)').fill('50');
  await adjustments.getByLabel('Begrunnelse').fill('Strømbrudd lørdag');
  await adjustments.getByRole('button', { name: 'Legg til justering' }).click();
  await expect(page.getByTestId('adjustment')).toContainText('Venter på godkjenning');
  // The Event Admin cannot approve adjustments.
  await expect(
    page.getByTestId('adjustment').getByRole('button', { name: 'Godkjenn' }),
  ).toHaveCount(0);
});

test('a second admin approves; the preparer cannot (four eyes)', async ({ browser }) => {
  // Organization Admin approves the adjustment (made by someone else) while it is a draft.
  const org = await browser.newContext();
  const orgPage = await org.newPage();
  await asOrgAdmin(orgPage);
  await orgPage.goto(batchUrl);
  await orgPage.getByTestId('adjustment').getByRole('button', { name: 'Godkjenn' }).click();
  await expect(orgPage.getByText('Justeringen er godkjent og linjene oppdatert.')).toBeVisible();
  const mama = orgPage.getByTestId('settlement-line').filter({ hasText: 'Mama Afrika Kjøkken' });
  await expect(mama).toContainText(/kr\s50,00/);

  // The Event Admin prepares; there is no approve button for them.
  const event = await browser.newContext();
  const eventPage = await event.newPage();
  await asEventAdmin(eventPage);
  await eventPage.goto(batchUrl);
  await eventPage.getByRole('button', { name: 'Send til godkjenning' }).click();
  await expect(eventPage.getByTestId('settlement-status').first()).toHaveAttribute(
    'data-status',
    'prepared',
  );
  await expect(eventPage.getByRole('button', { name: 'Godkjenn oppgjøret' })).toHaveCount(0);
  await expect(
    eventPage.getByText('Bare en organisasjonsadministrator kan godkjenne.'),
  ).toBeVisible();

  // The Organization Admin (who did not prepare it) approves.
  await orgPage.goto(batchUrl);
  await orgPage.getByRole('button', { name: 'Godkjenn oppgjøret' }).click();
  await expect(orgPage.getByText('Oppgjøret er godkjent.')).toBeVisible();
  const [row] = await sql<{ prepared: string; approved: string }>(
    `select u1.email as prepared, u2.email as approved from public.settlements s
       join auth.users u1 on u1.id = s.prepared_by join auth.users u2 on u2.id = s.approved_by
      where s.id = $1`,
    [batchUrl.split('/').at(-1)],
  );
  expect(row).toEqual({ prepared: 'event@affn.test', approved: 'admin@affn.test' });
  await org.close();
  await event.close();
});

test('a failed payout is retried; paid amounts equal the ledger to the øre (SET-03)', async ({
  page,
}) => {
  const id = batchUrl.split('/').at(-1)!;
  // Jollof House's payout account is restricted after approval: its payout fails.
  await sql(`update public.event_vendors set psp_account_status = 'restricted' where id = $1`, [
    JOLLOF,
  ]);
  try {
    await asOrgAdmin(page);
    await page.goto(batchUrl);
    await page.getByRole('button', { name: 'Betal ut' }).click();
    await expect(page.getByText('1 utbetaling feilet')).toBeVisible();
    await expect(page.getByTestId('settlement-status').first()).toHaveAttribute(
      'data-status',
      'completed_with_failures',
    );
    const jollof = page.getByTestId('settlement-line').filter({ hasText: 'Jollof House Oslo' });
    await expect(jollof.getByTestId('payout-status')).toHaveAttribute('data-status', 'failed');
  } finally {
    await sql(`update public.event_vendors set psp_account_status = 'eligible' where id = $1`, [
      JOLLOF,
    ]);
  }
  await page.getByRole('button', { name: 'Prøv mislykkede utbetalinger igjen' }).click();
  await expect(page.getByText('Alle utbetalinger er gjennomført.')).toBeVisible();
  await expect(page.getByTestId('settlement-status').first()).toHaveAttribute(
    'data-status',
    'completed',
  );
  await expect(
    page
      .getByTestId('settlement-line')
      .filter({ hasText: 'Jollof House Oslo' })
      .getByText('Forsøk 2'),
  ).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // Each line: net = the vendor's ledger movements in its period + approved adjustments, and the
  // payout ledger entries pay exactly that.
  const lines = await sql<{ net: number; ledger: number; paid: number; posted: number }>(
    `select l.net_payout_ore::int as net,
            (select coalesce(sum(case when e.direction = 'credit' then e.amount_ore else -e.amount_ore end), 0)::int
               from public.ledger_entries e
              where e.vendor_id = l.vendor_id and e.event_id = l.event_id and e.account = 'vendor_payable'
                and e.entry_type not in ('payout', 'adjustment')
                and e.created_at > coalesce(l.period_start, '-infinity') and e.created_at <= l.cutoff_at)
              + l.adjustments_ore::int as ledger,
            (select coalesce(sum(p.amount_ore), 0)::int from public.payouts p
              where p.settlement_line_id = l.id and p.status = 'paid') as paid,
            (select coalesce(sum(e.amount_ore), 0)::int from public.ledger_entries e
               join public.payouts p on p.id = e.payout_id
              where p.settlement_line_id = l.id and e.account = 'vendor_payable') as posted
       from public.settlement_lines l where l.settlement_id = $1`,
    [id],
  );
  expect(lines.length).toBeGreaterThanOrEqual(2);
  for (const l of lines) expect([l.ledger, l.paid, l.posted]).toEqual([l.net, l.net, l.net]);
  const [totals] = await sql<{ settled: number; paid: number }>(
    `select sum(net_payout_ore)::int as settled,
            (select sum(amount_ore)::int from public.payouts where settlement_id = $1 and status = 'paid') as paid
       from public.settlement_lines where settlement_id = $1`,
    [id],
  );
  expect(totals!.paid).toBe(totals!.settled);
  void AFFN_2027;
});

test('the vendor sees the settlement and that it is paid (SET-01)', async ({ page }) => {
  await signIn(page, 'vendor@affn.test');
  await expect(page).toHaveURL(/\/vendor$/);
  await page.goto('/vendor/settlements');
  const latest = page.getByTestId('vendor-settlement').first();
  await expect(latest).toHaveAttribute('data-status', 'paid');
  await expect(latest).toContainText('Justeringer');
  await expect(axe(page)).resolves.toEqual([]);
});
