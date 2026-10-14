import { expect, type Page } from '@playwright/test';
import { linkFrom, waitForEmail } from './mailpit';

export const SEED_PASSWORD = 'password';
export const NEW_PASSWORD = 'en lang og trygg setning 2027';

export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.affn.test`;

export async function signIn(
  page: Page,
  email: string,
  password = SEED_PASSWORD,
  path = '/sign-in',
) {
  await page.goto(path);
  await page.getByLabel(/^(E-post|Email)$/).fill(email);
  await page.getByLabel(/^(Passord|Password)$/).fill(password);
  await page.getByRole('button', { name: /^(Logg inn|Sign in)$/ }).click();
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Signs up through the form and confirms the email; ends signed in. */
export async function signUpAndVerify(
  page: Page,
  {
    email,
    role = 'vendor',
    locale = 'nb',
  }: { email: string; role?: 'vendor' | 'sponsor'; locale?: 'nb' | 'en' },
) {
  const prefix = locale === 'en' ? '/en' : '';
  await page.goto(`${prefix}/sign-up?role=${role}`);
  await page.getByLabel(locale === 'en' ? 'Full name' : 'Fullt navn').fill('Test Person');
  await page.getByLabel(locale === 'en' ? 'Email' : 'E-post').fill(email);
  await page.getByLabel(locale === 'en' ? 'Password' : 'Passord').fill(NEW_PASSWORD);
  await page.getByLabel(locale === 'en' ? /I accept/ : /Jeg godtar/).check();
  await page
    .getByRole('button', { name: locale === 'en' ? 'Create account' : 'Opprett konto' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${prefix}/check-email`));
  const mail = await waitForEmail(email, { subject: locale === 'en' ? 'Confirm' : 'Bekreft' });
  await page.goto(linkFrom(mail, '/api/auth/confirm'));
  return mail;
}
