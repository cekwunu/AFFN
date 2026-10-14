import { expect, test, type Page } from '@playwright/test';
import { NEW_PASSWORD, signIn, signOut, signUpAndVerify, uniqueEmail } from './support/auth';
import { AFFN_2027, AFFN_ORG, sql } from './support/db';
import { linkFrom, waitForEmail } from './support/mailpit';
import { freshTotp, SEED_TOTP_SECRET } from './support/totp';

// One worker and in order: some tests share seeded users and TOTP codes.
test.describe.configure({ mode: 'serial' });

async function passMfa(page: Page, secret = SEED_TOTP_SECRET) {
  await expect(page).toHaveURL(/\/mfa/);
  await page.getByLabel(/^(Kode fra appen|Code from the app)$/).fill(await freshTotp(secret));
  await page.getByRole('button', { name: /^(Bekreft|Confirm)$/ }).click();
  await expect(page).not.toHaveURL(/\/mfa/);
}

test.describe('sign-up and email verification (AUTH-01, AUTH-03)', () => {
  test('a vendor signs up, confirms the email and lands in the vendor portal as pending', async ({
    page,
  }) => {
    const email = uniqueEmail('vendor');
    const mail = await signUpAndVerify(page, { email, role: 'vendor' });
    expect(mail.subject).toContain('Bekreft e-postadressen din');
    expect(mail.text).toContain('Takk for at du registrerte deg');

    await expect(page).toHaveURL(/\/vendor$/);
    await expect(page.getByRole('heading', { name: 'Velkommen!' })).toBeVisible();
    const rows = await sql(
      `select m.organization_id, m.role, m.status from public.memberships m
         join auth.users u on u.id = m.user_id where u.email = $1`,
      [email],
    );
    expect(rows).toEqual([{ organization_id: AFFN_ORG, role: 'vendor', status: 'pending' }]);
  });

  test('a sponsor signs up in English and gets the English email', async ({ page }) => {
    const email = uniqueEmail('sponsor');
    const mail = await signUpAndVerify(page, { email, role: 'sponsor', locale: 'en' });
    expect(mail.text).toContain('Thank you for signing up');
    await expect(page).toHaveURL(/\/en\/sponsor$/);
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  });

  test('cannot sign in before confirming the email', async ({ page }) => {
    const email = uniqueEmail('unconfirmed');
    await page.goto('/sign-up?role=vendor');
    await page.getByLabel('Fullt navn').fill('Uten Bekreftelse');
    await page.getByLabel('E-post', { exact: true }).fill(email);
    await page.getByLabel('Passord').fill(NEW_PASSWORD);
    await page.getByLabel(/Jeg godtar/).check();
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await expect(page).toHaveURL(/\/check-email/);

    await signIn(page, email, NEW_PASSWORD);
    await expect(page.locator('form').getByRole('alert')).toContainText(
      'Bekreft e-postadressen din først',
    );
  });

  test('a short password is rejected', async ({ page }) => {
    await page.goto('/sign-up?role=vendor');
    await page.getByLabel('Fullt navn').fill('Kort Passord');
    await page.getByLabel('E-post', { exact: true }).fill(uniqueEmail('short'));
    await page.getByLabel('Passord').fill('kort');
    await page.getByLabel(/Jeg godtar/).check();
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('Passordet er for svakt');
  });
});

test.describe('sign-in routes each role to its portal (AUTH-02)', () => {
  for (const [email, portal] of [
    ['vendor@affn.test', '/vendor'],
    ['sponsor@affn.test', '/sponsor'],
    ['event@affn.test', '/admin'],
  ] as const) {
    test(`${email} → ${portal}`, async ({ page }) => {
      await signIn(page, email);
      await expect(page).toHaveURL(new RegExp(`${portal}$`));
    });
  }

  test('Organization Admin must pass MFA, then reaches the admin portal (AUTH-04)', async ({
    page,
  }) => {
    await signIn(page, 'admin@affn.test');
    await expect(page.getByRole('heading', { name: 'Bekreft at det er deg' })).toBeVisible();
    // MFA cannot be skipped by going to the portal directly.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/mfa\?next=%2Fadmin/);
    await passMfa(page);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('Platform Owner must pass MFA, then reaches the platform portal', async ({ page }) => {
    await signIn(page, 'platform@affn.test');
    await passMfa(page);
    await expect(page).toHaveURL(/\/platform$/);
  });

  test('a wrong MFA code is rejected', async ({ page }) => {
    await signIn(page, 'admin@affn.test');
    await expect(page).toHaveURL(/\/mfa/);
    await page.getByLabel('Kode fra appen').fill('000000');
    await page.getByRole('button', { name: 'Bekreft' }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('Koden stemmer ikke');
  });

  test('a user with two roles chooses a portal and can switch', async ({ page }) => {
    await signIn(page, 'multi@affn.test');
    await expect(page).toHaveURL(/\/select-role$/);
    await page.getByRole('link', { name: 'Sponsor' }).click();
    await expect(page).toHaveURL(/\/sponsor$/);
    await page.getByRole('button', { name: 'Konto' }).click();
    await page.getByRole('menuitem', { name: 'Leverandør' }).click();
    await expect(page).toHaveURL(/\/vendor$/);
  });

  test('signing out ends the session', async ({ page }) => {
    await signIn(page, 'vendor@affn.test');
    await expect(page).toHaveURL(/\/vendor$/);
    await page.getByRole('button', { name: 'Konto' }).click();
    await page.getByRole('menuitem', { name: 'Logg ut' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/vendor');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fvendor/);
  });
});

test.describe('blocked access to other portals', () => {
  test('signed-out visitors are sent to sign-in, then back to where they were going', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin/);
    await page.getByLabel('E-post', { exact: true }).fill('event@affn.test');
    await page.getByLabel('Passord').fill('password');
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  for (const [email, blocked] of [
    ['vendor@affn.test', ['/admin', '/sponsor', '/platform']],
    ['sponsor@affn.test', ['/vendor', '/admin', '/platform']],
    ['event@affn.test', ['/vendor', '/sponsor', '/platform']],
  ] as const) {
    test(`${email} gets 403 on ${blocked.join(', ')}`, async ({ page }) => {
      await signIn(page, email);
      await expect(page).not.toHaveURL(/\/sign-in/);
      for (const path of blocked) {
        const response = await page.goto(path);
        expect(response?.status(), path).toBe(403);
        await expect(page.getByRole('heading', { name: 'Ingen tilgang' })).toBeVisible();
      }
    });
  }
});

test.describe('MFA enrolment (AUTH-04)', () => {
  test('a newly promoted Organization Admin must enrol TOTP before reaching the admin portal', async ({
    page,
  }) => {
    const email = uniqueEmail('new-admin');
    await signUpAndVerify(page, { email });
    const [user] = await sql<{ id: string }>(`select id from auth.users where email = $1`, [email]);
    await sql(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'org_admin')`,
      [AFFN_ORG, user!.id],
    );
    await signOut(page);

    await signIn(page, email, NEW_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Sett opp tofaktorinnlogging' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR-kode for autentiseringsappen' })).toBeVisible();
    const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
    await passMfa(page, secret);
    // They also signed up as a vendor, so they hold two roles and choose a portal.
    await expect(page).toHaveURL(/\/select-role$/);
    await page.getByRole('link', { name: 'Administrasjon' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // Next time: a challenge, not a new enrolment.
    await signOut(page);
    await signIn(page, email, NEW_PASSWORD, `/sign-in?next=${encodeURIComponent('/admin')}`);
    await expect(page.getByRole('heading', { name: 'Bekreft at det er deg' })).toBeVisible();
    await passMfa(page, secret);
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe('password reset (AUTH-01)', () => {
  test('forgot password → email → new password → sign in with it', async ({ page }) => {
    const email = uniqueEmail('reset');
    await signUpAndVerify(page, { email });
    await signOut(page);

    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Glemt passordet?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel('E-post', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send lenke' }).click();
    await expect(page).toHaveURL(/\/check-email\?kind=reset/);

    const reset = await waitForEmail(email, { subject: 'Tilbakestill' });
    await page.goto(linkFrom(reset, '/api/auth/confirm'));
    await expect(page).toHaveURL(/\/reset-password$/);

    const password = 'et helt nytt passord for testen';
    await page.getByLabel('Nytt passord').fill(password);
    await page.getByLabel('Gjenta passordet').fill(password);
    await page.getByRole('button', { name: 'Lagre passord' }).click();
    await expect(page).toHaveURL(/\/vendor$/);

    await signOut(page);
    await signIn(page, email, NEW_PASSWORD);
    await expect(page.locator('form').getByRole('alert')).toContainText(
      'Feil e-post eller passord',
    );
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/vendor$/);
  });

  test('the reset form does not reveal whether an account exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('E-post', { exact: true }).fill(uniqueEmail('nobody'));
    await page.getByRole('button', { name: 'Send lenke' }).click();
    await expect(page).toHaveURL(/\/check-email\?kind=reset/);
  });
});

test.describe('Event Admin invitation (AUTH-03)', () => {
  test('an Organization Admin invites, the invitee signs up and accepts, and it is audit-logged', async ({
    page,
  }) => {
    const email = uniqueEmail('invited');
    await signIn(page, 'admin@affn.test');
    await passMfa(page);
    await page.goto('/admin/team');
    await page.getByLabel('E-post', { exact: true }).fill(email);
    await page.getByLabel('Arrangement').selectOption({ label: 'AFFN 2027' });
    await page.getByRole('button', { name: 'Send invitasjon' }).click();
    await expect(page.getByRole('status')).toContainText('Invitasjonen er sendt');
    await expect(page.getByText(email)).toBeVisible();
    await signOut(page);

    const invitation = await waitForEmail(email, { subject: 'Invitasjon' });
    expect(invitation.subject).toContain('Invitasjon til African Food Festival Norway');
    await page.goto(linkFrom(invitation, '/invite/'));
    await expect(
      page.getByText(/har invitert deg som arrangementsadministrator for AFFN 2027/),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Opprett konto' }).click();
    await expect(page.getByLabel('E-post', { exact: true })).toHaveValue(email);
    await page.getByLabel('Fullt navn').fill('Ny Arrangør');
    await page.getByLabel('Passord').fill(NEW_PASSWORD);
    await page.getByLabel(/Jeg godtar/).check();
    await page.getByRole('button', { name: 'Opprett konto' }).click();

    const confirm = await waitForEmail(email, { subject: 'Bekreft' });
    await page.goto(linkFrom(confirm, '/api/auth/confirm'));
    await expect(page).toHaveURL(/\/invite\//);
    await page.getByRole('button', { name: 'Godta invitasjonen' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const [user] = await sql<{ id: string }>(`select id from auth.users where email = $1`, [email]);
    expect(
      await sql(`select role, status from public.memberships where user_id = $1`, [user!.id]),
    ).toEqual([{ role: 'event_admin', status: 'active' }]);
    expect(
      await sql(`select event_id from public.event_admins where user_id = $1`, [user!.id]),
    ).toEqual([{ event_id: AFFN_2027 }]);
    const audit = await sql<{ table_name: string; action: string }>(
      `select table_name, action from public.audit_log
        where (table_name = 'memberships' and new_data ->> 'user_id' = $1)
           or (table_name = 'invitations' and new_data ->> 'email' = $2)
        order by created_at`,
      [user!.id, email],
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        { table_name: 'invitations', action: 'insert' },
        { table_name: 'memberships', action: 'insert' },
        { table_name: 'invitations', action: 'update' },
      ]),
    );
  });

  test('an Organization Admin can revoke an Event Admin, and access ends at once', async ({
    page,
    browser,
  }) => {
    // A fresh Event Admin, signed in in a second browser.
    const email = uniqueEmail('revoked');
    const other = await browser.newPage();
    await signUpAndVerify(other, { email });
    const [user] = await sql<{ id: string }>(`select id from auth.users where email = $1`, [email]);
    await sql(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'event_admin')`,
      [AFFN_ORG, user!.id],
    );
    await signOut(other);
    await signIn(other, email, NEW_PASSWORD);
    await expect(other).toHaveURL(/\/select-role|\/admin/);
    await other.goto('/admin');
    await expect(other).toHaveURL(/\/admin$/);

    await signIn(page, 'admin@affn.test');
    await passMfa(page);
    await page.goto('/admin/team');
    const row = page.getByRole('listitem').filter({ hasText: email });
    await row.getByRole('button', { name: 'Fjern tilgang' }).click();
    await expect(page.getByText(email)).toHaveCount(0);

    // The other browser still has a token listing the role, but the live check denies it.
    await other.goto('/admin');
    await expect(other).toHaveURL(/\/forbidden|\/vendor/);
    const audit = await sql(
      `select action from public.audit_log where table_name = 'memberships' and old_data ->> 'user_id' = $1`,
      [user!.id],
    );
    expect(audit).toEqual([{ action: 'delete' }]);
    await other.close();
  });
});

test.describe('rate limits (NFR-06)', () => {
  test('repeated failed sign-ins are blocked', async ({ page }) => {
    const email = uniqueEmail('attacker-target');
    for (let attempt = 1; attempt <= 5; attempt++) {
      await signIn(page, email, `wrong-password-${attempt}`);
      await expect(page.locator('form').getByRole('alert')).toContainText(
        'Feil e-post eller passord',
      );
    }
    await signIn(page, email, 'wrong-password-6');
    await expect(page.locator('form').getByRole('alert')).toContainText('For mange forsøk');
  });
});
