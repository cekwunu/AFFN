import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { submittedApplicant } from './support/applicants';
import { signIn } from './support/auth';
import { sql } from './support/db';
import { signMock } from './support/mock-psp';

// Payment provider layer (P09): vendor payment onboarding in test mode (VEN-06) and webhook
// idempotency.

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

test('a vendor goes from not started to enabled in test mode (VEN-06)', async ({ page }) => {
  const vendor = await approvedVendor('utbetaling');
  await signIn(page, vendor.email, vendor.password);
  await expect(page).toHaveURL(/\/vendor$/);
  await expect(page.getByTestId('next-steps')).toContainText('Sett opp utbetalinger');

  await page.getByRole('link', { name: 'Utbetalinger', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Utbetalinger' })).toBeVisible();
  await expect(page.getByText('TESTMODUS', { exact: true })).toBeVisible();
  await expect(page.getByTestId('payout-status')).toHaveText('Ikke startet');
  await expect(page.getByText('Du kan ikke selge før utbetalinger er aktivert.')).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);

  // First visit: the provider needs more information.
  await page.getByRole('button', { name: 'Sett opp utbetalinger' }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await expect(page.getByRole('heading', { name: 'Oppsett av utbetalinger' })).toBeVisible();
  await expect(page.getByText('TESTMODUS', { exact: true })).toBeVisible();
  await expect(axe(page)).resolves.toEqual([]);
  await page.getByRole('button', { name: 'Simuler at mer informasjon trengs' }).click();
  await expect(page).toHaveURL(/\/vendor\/payouts\?returned=1$/);
  await expect(page.getByTestId('payout-status')).toHaveText('Krever handling');

  // Second visit: verification completes.
  await page.getByRole('button', { name: 'Gi utfyllende informasjon' }).click();
  await page.getByRole('button', { name: 'Fullfør verifiseringen' }).click();
  await expect(page.getByTestId('payout-status')).toHaveText('Aktivert');
  await expect(
    page.getByText('Alt er klart. Gjestene kan betale deg på festivalen.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Sett opp|Fortsett|Gi utfyllende/ })).toHaveCount(
    0,
  );

  const [ev] = await sql<{ psp_account_id: string; psp_account_status: string }>(
    `select psp_account_id, psp_account_status from public.event_vendors where id = $1`,
    [vendor.eventVendorId],
  );
  expect(ev).toMatchObject({ psp_account_status: 'eligible' });
  expect(ev!.psp_account_id).toMatch(/^mock_acct_/);
  const audit = await sql<{ actor_id: string | null; status: string }>(
    `select actor_id, new_data ->> 'psp_account_status' as status from public.audit_log
      where table_name = 'event_vendors' and row_id = $1
        and old_data ->> 'psp_account_status' is distinct from new_data ->> 'psp_account_status'
      order by created_at`,
    [vendor.eventVendorId],
  );
  expect(audit.map((a) => a.status)).toEqual(['pending', 'restricted', 'eligible']);
  expect(audit[0]!.actor_id).toBe(vendor.userId);

  await page.getByRole('link', { name: 'Oversikt' }).click();
  await expect(page.getByText('Aktivert')).toBeVisible();
});

test('webhooks: signatures are checked and a repeated event is never processed twice', async ({
  request,
}) => {
  const vendor = await approvedVendor('webhook');
  const accountId = `mock_acct_e2e_${crypto.randomUUID().slice(0, 8)}`;
  await sql(
    `update public.event_vendors set psp_account_id = $2, psp_account_status = 'pending' where id = $1`,
    [vendor.eventVendorId, accountId],
  );
  const event = {
    id: `evt_e2e_${crypto.randomUUID()}`,
    type: 'account.updated',
    accountId,
    status: 'enabled',
  };
  const body = JSON.stringify(event);
  const post = (signature: string, data = body) =>
    request.post('/api/webhooks/mock', {
      data,
      headers: { 'content-type': 'application/json', 'x-affn-signature': signature },
    });

  const forged = await post('not-a-signature');
  expect(forged.status()).toBe(400);
  expect(await forged.json()).toEqual({ result: 'invalid' });

  const first = await post(signMock(body));
  expect(await first.json()).toEqual({ result: 'processed' });
  const second = await post(signMock(body));
  expect(second.status()).toBe(200);
  expect(await second.json()).toEqual({ result: 'duplicate' });

  const [state] = await sql<{ psp_account_status: string }>(
    `select psp_account_status from public.event_vendors where id = $1`,
    [vendor.eventVendorId],
  );
  expect(state!.psp_account_status).toBe('eligible');
  const stored = await sql<{ signature_valid: boolean; attempts: number }>(
    `select e.signature_valid, (select count(*)::int from public.psp_webhook_attempts a where a.webhook_event_id = e.id) as attempts
       from public.psp_webhook_events e where e.provider = 'mock' and e.provider_event_id = $1`,
    [event.id],
  );
  expect(stored).toEqual([{ signature_valid: true, attempts: 1 }]);

  const unknownProvider = await request.post('/api/webhooks/paypal', { data: body });
  expect(unknownProvider.status()).toBe(404);
});
