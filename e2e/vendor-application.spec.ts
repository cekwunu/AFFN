import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { NEW_PASSWORD, signIn, signOut, signUpAndVerify, uniqueEmail } from './support/auth';
import { AFFN_2027, sql } from './support/db';

// Vendor onboarding (VEN-01 … VEN-05). Brønnøysundregistrene is the stub in support/brreg-stub.mjs:
// any valid number is an active AS, except these fixed answers.
const DELETED = '974000008';
const NOT_FOUND = '910000004';
const BANKRUPT = '987654325';
const BAD_CHECKSUM = '923456789';
const SPECIAL = new Set([DELETED, NOT_FOUND, BANKRUPT, '920000002']);

const EVENT_ADMIN = '00000000-0000-4000-8000-000000000003';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A fresh, valid (modulus-11) org number for each run. */
function newOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = `9${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
    const rest = [...base].reduce((sum, d, i) => sum + Number(d) * weights[i]!, 0) % 11;
    const check = rest === 0 ? 0 : 11 - rest;
    const number = `${base}${check}`;
    if (check !== 10 && !SPECIAL.has(number)) return number;
  }
}

const pdf = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'),
});
// A 1×1 PNG.
const png = {
  name: 'logo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
}

async function lookUp(page: Page, orgNumber: string) {
  await page.getByLabel('Organisasjonsnummer').fill(orgNumber);
  await page.getByRole('button', { name: 'Slå opp' }).click();
}

const continueButton = (page: Page) => page.getByRole('button', { name: 'Lagre og fortsett' });

/** Signs up a new vendor and opens the first step of the application. */
async function newVendor(page: Page, label: string) {
  const email = uniqueEmail(label);
  await signUpAndVerify(page, { email, role: 'vendor' });
  await expect(page).toHaveURL(/\/vendor$/);
  await page.getByRole('link', { name: 'Start søknaden' }).click();
  await expect(page).toHaveURL(/\/vendor\/apply\/business$/);
  return email;
}

test.describe.configure({ mode: 'serial' });

let applicant = { email: '', orgNumber: '' };

test.describe('become a vendor (VEN-01)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the public page shows stall fees, commission with a worked example and key dates', async ({
    page,
  }) => {
    await page.goto('/become-a-vendor');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Selg maten din på AFFN 2027');
    await expect(page.getByText('kr 2 500,00')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Provisjon: 10 % + mva' })).toBeVisible();
    const example = page.getByRole('table');
    await expect(example.getByRole('row', { name: /Du får utbetalt/ })).toContainText('kr 437,50');
    await expect(page.getByText('Søknadsfrist')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Søk om stand' }).first()).toHaveAttribute(
      'href',
      '/sign-up?role=vendor',
    );
    await expectNoAxeViolations(page);
  });
});

test.describe('the application (VEN-01 … VEN-05)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a new vendor completes all seven steps and submits', async ({ page }) => {
    const email = await newVendor(page, 'applicant');
    const orgNumber = newOrgNumber();
    applicant = { email, orgNumber };

    // 1. Business: registry data is pre-filled from Brønnøysundregistrene.
    await lookUp(page, orgNumber);
    await expect(page.getByRole('heading', { name: 'Vi fant virksomheten' })).toBeVisible();
    await expect(page.getByText(`E2E TESTKJØKKEN ${orgNumber} AS`)).toBeVisible();
    await expect(page.getByText('Testveien 1, 0155 Oslo')).toBeVisible();
    await page.getByRole('button', { name: 'Ja, dette er oss' }).click();

    // 2. Contact (email pre-filled; phone validated as +47).
    await expect(page).toHaveURL(/\/vendor\/apply\/contact$/);
    await expect(page.getByLabel('E-post')).toHaveValue(email);
    await page.getByLabel('Fullt navn').fill('Ada Testesen');
    await page.getByLabel('Mobilnummer').fill('123');
    await continueButton(page).click();
    await expect(page.getByText('Skriv et norsk telefonnummer med 8 siffer')).toBeVisible();
    await expect(page.getByLabel('Mobilnummer')).toBeFocused();
    await page.getByLabel('Mobilnummer').fill('400 00 001');
    await expectNoAxeViolations(page);
    await continueButton(page).click();

    // 3. Profile.
    await expect(page).toHaveURL(/\/vendor\/apply\/profile$/);
    await expect(page.getByLabel('Navn på boden')).toHaveValue(`E2e Testkjøkken ${orgNumber}`);
    await page.getByLabel('Navn på boden').fill('Ada sitt kjøkken');
    await page.getByLabel('Hva selger du?').selectOption({ label: 'Varmmat' });
    await page.getByLabel('Matens opprinnelsesland').selectOption({ label: 'Nigeria' });
    await page
      .getByLabel('Beskrivelse')
      .fill('Jollof, suya og puff-puff laget fra bunnen av etter mormors oppskrift.');
    await page.getByLabel('Instagram').fill('@adaskjokken');
    await page.locator('input[type="file"]').first().setInputFiles(png);
    await expect(page.getByText('Bildet er lagret.')).toBeVisible();
    await continueButton(page).click();

    // 4. Stall.
    await expect(page).toHaveURL(/\/vendor\/apply\/stall$/);
    await page.getByRole('radio', { name: /Standard/ }).check();
    await page.getByLabel('Jeg trenger strøm').check();
    await page.getByLabel('Ønsket område').selectOption('Food court');
    await continueButton(page).click();

    // 5. Documents: food vendors need Mattilsynet registration; stored privately.
    await expect(page).toHaveURL(/\/vendor\/apply\/documents$/);
    await expect(page.getByText('Registrering hos Mattilsynet mangler.')).toBeVisible();
    await page.getByLabel('Type dokument').selectOption('mattilsynet_registration');
    await page.getByLabel('Gyldig til').fill('2028-12-31');
    await page.locator('input[type="file"]').setInputFiles(pdf('mattilsynet.pdf'));
    await page.getByRole('button', { name: 'Last opp dokument' }).click();
    const list = page.getByRole('region', { name: 'Dine dokumenter' });
    await expect(list.getByText('Registrering hos Mattilsynet')).toBeVisible();
    await expect(list.getByText('Venter på kontroll')).toBeVisible();
    await expect(page.getByText('Registrering hos Mattilsynet mangler.')).toBeHidden();
    const view = await page.request.get(
      (await list.getByRole('link', { name: 'Vis' }).getAttribute('href'))!,
      { maxRedirects: 0 },
    );
    expect(view.status()).toBe(307);
    expect(view.headers().location).toContain('/storage/v1/object/sign/vendor-documents/');
    await page.getByRole('link', { name: 'Lagre og fortsett' }).click();

    // 6. Agreement with commission, stall fee and settlement terms.
    await expect(page).toHaveURL(/\/vendor\/apply\/agreement$/);
    const agreement = page.getByRole('article');
    await expect(agreement).toContainText('10 % + mva');
    await expect(agreement).toContainText('Standard (3 × 3 m) er kr 2 500,00');
    await expect(agreement).toContainText(orgNumber.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'));
    await page.getByRole('button', { name: 'Godta avtalen' }).click();
    await expect(page.getByText('Dette feltet må fylles ut.')).toBeVisible();
    await page.getByLabel('Jeg har lest og godtar leverandøravtalen').check();
    await page.getByRole('button', { name: 'Godta avtalen' }).click();

    // 7. Review and submit.
    await expect(page).toHaveURL(/\/vendor\/apply\/review$/);
    await expect(page.getByText('Ada sitt kjøkken')).toBeVisible();
    await expect(page.getByText('+47 400 00 001')).toBeVisible();
    await page.getByRole('button', { name: 'Send inn søknaden' }).click();
    await expect(page).toHaveURL(/\/vendor\/application$/);
    await expect(page.getByTestId('application-status')).toHaveText('Sendt inn');
    await expect(page.getByText('Takk! Vi har mottatt søknaden')).toBeVisible();

    const [row] = await sql(
      `select ev.status, v.org_number, v.legal_name, v.category, v.cuisine_country, c.contact_phone,
              ev.needs_power, ev.preferred_zone, st.name_nb as stall_type
         from public.event_vendors ev
         join public.vendors v on v.id = ev.vendor_id
         join public.vendor_contacts c on c.vendor_id = v.id
         join public.stall_types st on st.id = ev.stall_type_id
        where v.org_number = $1 and ev.event_id = $2`,
      [orgNumber, AFFN_2027],
    );
    expect(row).toEqual({
      status: 'submitted',
      org_number: orgNumber,
      legal_name: `E2E TESTKJØKKEN ${orgNumber} AS`,
      category: 'hot-food',
      cuisine_country: 'NG',
      contact_phone: '+47 400 00 001',
      needs_power: true,
      preferred_zone: 'Food court',
      stall_type: 'Standard',
    });
  });

  test('acceptance of the agreement is stored with version, terms, user and time (VEN-05)', async () => {
    const rows = await sql(
      `select a.terms_version, a.commission_terms, a.stall_fee_terms, a.settlement_terms,
              u.email, a.accepted_at > now() - interval '10 minutes' as recent
         from public.vendor_agreements a
         join public.vendors v on v.id = a.vendor_id
         join auth.users u on u.id = a.accepted_by
        where v.org_number = $1`,
      [applicant.orgNumber],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      terms_version: '2027.1-draft',
      commission_terms: '10 % + mva',
      email: applicant.email,
      recent: true,
    });
    expect(rows[0]!.stall_fee_terms).toContain('kr 2 500,00');
    expect(rows[0]!.settlement_terms).toContain('lisensiert betalingsleverandør');
    const audit = await sql(
      `select count(*)::int as n from public.audit_log l
         join public.vendors v on v.id = (l.new_data ->> 'vendor_id')::uuid
        where l.table_name = 'vendor_agreements' and v.org_number = $1`,
      [applicant.orgNumber],
    );
    expect(audit[0]!.n).toBe(1);
  });

  test('invalid org numbers are rejected (VEN-02)', async ({ page }) => {
    await newVendor(page, 'invalid-org');
    const cases: [string, string][] = [
      [BAD_CHECKSUM, 'Organisasjonsnummeret er ikke gyldig'],
      [NOT_FOUND, 'Vi fant ikke dette organisasjonsnummeret'],
      [DELETED, 'Virksomheten er slettet'],
      [BANKRUPT, 'registrert som konkurs'],
    ];
    for (const [orgNumber, message] of cases) {
      await lookUp(page, orgNumber);
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
      await expect(page.getByLabel('Organisasjonsnummer')).toHaveAttribute('aria-invalid', 'true');
    }
    // A business that is already registered cannot be claimed again.
    await lookUp(page, applicant.orgNumber);
    await page.getByRole('button', { name: 'Ja, dette er oss' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'allerede registrert' })).toBeVisible();
    await expect(page).toHaveURL(/\/vendor\/apply\/business$/);
  });

  test('a draft survives signing out (VEN-04)', async ({ page }) => {
    const email = await newVendor(page, 'draft');
    await lookUp(page, newOrgNumber());
    await page.getByRole('button', { name: 'Ja, dette er oss' }).click();
    await expect(page).toHaveURL(/\/vendor\/apply\/contact$/);

    // Half-filled and not yet valid: autosaved as a draft.
    await page.getByLabel('Fullt navn').fill('Halvferdig Hansen');
    await page.getByLabel('Mobilnummer').fill('400 1');
    await expect(page.getByRole('status').filter({ hasText: 'Lagret.' })).toBeVisible();

    await signOut(page);
    await signIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/vendor$/);
    await page.getByRole('link', { name: 'Fortsett søknaden' }).click();
    await expect(page).toHaveURL(/\/vendor\/apply\/contact$/);
    await expect(page.getByLabel('Fullt navn')).toHaveValue('Halvferdig Hansen');
    await expect(page.getByLabel('Mobilnummer')).toHaveValue('400 1');
  });

  test('when more information is requested, the vendor sees the message, edits and resubmits', async ({
    page,
  }) => {
    await sql(
      `with ev as (
         update public.event_vendors ev set status = 'more_info_requested'
           from public.vendors v
          where v.id = ev.vendor_id and v.org_number = $1 and ev.event_id = $2
         returning ev.*)
       insert into public.application_reviews
         (organization_id, event_id, event_vendor_id, vendor_id, from_status, to_status, note, actor_id)
       select organization_id, event_id, id, vendor_id, 'submitted', 'more_info_requested',
              'Legg ved menyen med priser, takk.', $3 from ev`,
      [applicant.orgNumber, AFFN_2027, EVENT_ADMIN],
    );

    await signIn(page, applicant.email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/vendor$/);
    await page.getByRole('link', { name: 'Se søknaden' }).click();
    await expect(page.getByTestId('application-status')).toHaveText('Trenger mer informasjon');
    await expect(page.getByRole('region', { name: 'Melding fra AFFN' })).toContainText(
      'Legg ved menyen med priser, takk.',
    );
    await page.getByRole('link', { name: 'Endre og send inn på nytt' }).click();
    await expect(page).toHaveURL(/\/vendor\/apply\/review$/);
    await page.getByRole('link', { name: 'Endre Profil' }).click();
    await page
      .getByLabel('Beskrivelse')
      .fill('Jollof, suya og puff-puff. Menyen med priser ligger nå på nettsiden vår.');
    await continueButton(page).click();
    await page.goto('/vendor/apply/review');
    await page.getByRole('button', { name: 'Send inn på nytt' }).click();
    await expect(page.getByTestId('application-status')).toHaveText('Sendt inn');

    // Submitted applications cannot be edited.
    await page.goto('/vendor/apply/profile');
    await expect(page).toHaveURL(/\/vendor\/application$/);
  });
});
