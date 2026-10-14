import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { submittedApplicant, type Applicant } from './support/applicants';
import { signIn, signOut } from './support/auth';
import { sql } from './support/db';
import { waitForEmail } from './support/mailpit';

// Review centre (REV-01 … REV-03, SYS-01). The Event Admin (no MFA) reviews freshly seeded
// applicants, so the tests can run again without a database reset.
const EVENT_ADMIN_ID = '00000000-0000-4000-8000-000000000003';

async function asEventAdmin(page: Page) {
  await signIn(page, 'event@affn.test');
  await expect(page).toHaveURL(/\/admin$/);
}

async function openApplication(page: Page, applicant: Applicant) {
  await page.goto('/admin/applications');
  await page.getByLabel('Søk', { exact: true }).fill(applicant.name);
  await page.getByRole('button', { name: 'Filtrer' }).click();
  await page.getByRole('link', { name: `Åpne søknaden fra ${applicant.name}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: applicant.name })).toBeVisible();
}

async function decide(page: Page, action: string, note: string) {
  await page.getByRole('radio', { name: action }).check();
  await page.getByLabel('Notat', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Velg handling' }).click();
}

const auditRows = (eventVendorId: string) =>
  sql<{ old_status: string; new_status: string; reason: string }>(
    `select old_data ->> 'status' as old_status, new_data ->> 'status' as new_status, reason
       from public.audit_log
      where table_name = 'event_vendors' and row_id = $1 and actor_id = $2
      order by created_at`,
    [eventVendorId, EVENT_ADMIN_ID],
  );

test.describe.configure({ mode: 'serial' });

test.describe('review queue and detail (REV-01)', () => {
  test('the queue filters and counts, and the detail shows answers and documents', async ({
    page,
  }) => {
    const applicant = await submittedApplicant('queue');
    await asEventAdmin(page);
    await page.goto('/admin/applications');
    const submitted = page.getByRole('link', { name: /^Sendt inn \d+$/ });
    await expect(submitted).toBeVisible();
    await submitted.click();
    await expect(page).toHaveURL(/status=submitted/);

    await page.getByLabel('Søk', { exact: true }).fill(applicant.name);
    await page.getByLabel('Dokumenter', { exact: true }).selectOption('missing');
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page.getByText('Ingen søknader passer filtrene.')).toBeVisible();
    await page.getByLabel('Dokumenter', { exact: true }).selectOption('complete');
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(
      page.getByRole('link', { name: `Åpne søknaden fra ${applicant.name}` }),
    ).toBeVisible();
    await expect(
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
        .then((r) => r.violations.map((v) => v.id)),
    ).resolves.toEqual([]);

    await page.getByRole('link', { name: `Åpne søknaden fra ${applicant.name}` }).click();
    await expect(page.getByText('Testveien 1, 0155 Oslo')).toBeVisible();
    await expect(page.getByText('+47 400 00 001')).toBeVisible();
    await expect(page.getByRole('button', { name: /Registrering hos Mattilsynet/ })).toBeVisible();
    await expect(page.getByText('Gyldig til 31. des. 2028')).toBeVisible();
    await expect(page.getByText(/Godtatt .* \(versjon 2027\.1-draft\)/)).toBeVisible();
  });
});

test.describe('review actions (REV-02, REV-03, SYS-01)', () => {
  test('request more info: the vendor gets the note by email and on the status page; internal notes stay hidden', async ({
    page,
  }) => {
    const applicant = await submittedApplicant('info');
    await asEventAdmin(page);
    await openApplication(page, applicant);

    await page.getByLabel('Nytt notat').fill('Hemmelig: sjekk referanser fra 2025');
    await page.getByRole('button', { name: 'Legg til notat' }).click();
    await expect(page.getByTestId('internal-notes')).toContainText('Hemmelig: sjekk referanser');

    // A note is required.
    await page.getByRole('radio', { name: 'Be om mer informasjon' }).check();
    await page.getByRole('button', { name: 'Velg handling' }).click();
    await expect(page.getByText('Skriv et notat.')).toBeVisible();

    await decide(page, 'Be om mer informasjon', 'Legg ved menyen med priser.');
    await expect(page.getByTestId('review-status')).toHaveText('Trenger mer informasjon');
    const mail = await waitForEmail(applicant.email, { subject: 'Vi trenger mer informasjon' });
    expect(mail.text).toContain('Legg ved menyen med priser.');
    expect(mail.text).not.toContain('Hemmelig');

    await signOut(page);
    await signIn(page, applicant.email, applicant.password);
    await expect(page).toHaveURL(/\/vendor$/);
    await page.getByRole('link', { name: 'Se søknaden' }).click();
    await expect(page.getByRole('region', { name: 'Melding fra AFFN' })).toContainText(
      'Legg ved menyen med priser.',
    );
    await expect(page.getByText(/Hemmelig/)).toHaveCount(0);

    expect(await auditRows(applicant.eventVendorId)).toEqual([
      {
        old_status: 'submitted',
        new_status: 'more_info_requested',
        reason: 'Legg ved menyen med priser.',
      },
    ]);
  });

  test('reject sends the note; waitlist does not', async ({ page }) => {
    const rejected = await submittedApplicant('reject');
    const waitlisted = await submittedApplicant('waitlist');
    await asEventAdmin(page);

    await openApplication(page, rejected);
    await decide(page, 'Avslå', 'Vi har allerede mange boder med samme meny.');
    await expect(page.getByTestId('review-status')).toHaveText('Avslått');
    const rejection = await waitForEmail(rejected.email, { subject: 'Svar på søknaden' });
    expect(rejection.text).toContain('Vi har allerede mange boder med samme meny.');

    await openApplication(page, waitlisted);
    await decide(page, 'Sett på venteliste', 'Intern: sjekk igjen i mars');
    await expect(page.getByTestId('review-status')).toHaveText('På venteliste');
    const waitlist = await waitForEmail(waitlisted.email, { subject: 'venteliste' });
    expect(waitlist.text).not.toContain('Intern: sjekk igjen');

    expect(await auditRows(rejected.eventVendorId)).toHaveLength(1);
    expect(await auditRows(waitlisted.eventVendorId)).toHaveLength(1);
  });

  test('approve: stall fee invoice with 25 % mva, approval email, one audit row per action', async ({
    page,
  }) => {
    const applicant = await submittedApplicant('approve');
    await asEventAdmin(page);
    await openApplication(page, applicant);

    await decide(page, 'Start behandling', 'Ser på søknaden');
    await expect(page.getByTestId('review-status')).toHaveText('Under behandling');
    // Event Admins see the default commission but cannot override it.
    await page.getByRole('radio', { name: 'Godkjenn' }).check();
    await expect(page.getByText('Standard: 10 % + mva')).toBeVisible();
    await expect(page.getByLabel('Egen provisjonssats (%)')).toHaveCount(0);
    await decide(page, 'Godkjenn', 'Velkommen til AFFN 2027!');
    await expect(page.getByTestId('review-status')).toHaveText('Godkjent');
    await expect(page.getByText(/Faktura \d+: kr\s3\s125,00 \(fakturert\)/)).toBeVisible();

    const mail = await waitForEmail(applicant.email, { subject: 'er godkjent' });
    expect(mail.text).toContain('faktura for standavgiften');

    const [fee] = await sql(
      `select f.amount_ore::int, f.mva_ore::int, f.total_ore::int, i.kind, i.status
         from public.stall_fees f join public.invoices i on i.stall_fee_id = f.id
        where f.event_vendor_id = $1`,
      [applicant.eventVendorId],
    );
    expect(fee).toEqual({
      amount_ore: 250000,
      mva_ore: 62500,
      total_ore: 312500,
      kind: 'stall_fee',
      status: 'issued',
    });
    expect(await auditRows(applicant.eventVendorId)).toEqual([
      { old_status: 'submitted', new_status: 'under_review', reason: 'Ser på søknaden' },
      { old_status: 'under_review', new_status: 'approved', reason: 'Velkommen til AFFN 2027!' },
    ]);
    await expect(page.getByText('Søknaden har status «Godkjent».')).toBeVisible();
  });
});
