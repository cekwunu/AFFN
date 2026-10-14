import { expect, test } from '@playwright/test';

test('home page loads in bokmål and switches to English', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nb');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('African Food Festival Norway');
  await expect(page.getByText('Skann QR-koden ved boden')).toBeVisible();

  await page.getByRole('banner').getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Scan the QR code at the stall')).toBeVisible();
});
