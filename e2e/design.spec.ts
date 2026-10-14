import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoAxeViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 5)
        .join(' | ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

const pages = [
  {
    path: '/design',
    lang: 'nb',
    openDialog: 'Åpne dialog',
    openSheet: 'Åpne panel',
    menu: 'Handlinger',
  },
  {
    path: '/en/design',
    lang: 'en',
    openDialog: 'Open dialog',
    openSheet: 'Open panel',
    menu: 'Actions',
  },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`/design in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const p of pages) {
      test(`${p.path} has no WCAG 2.1 AA violations`, async ({ page }) => {
        await page.goto(p.path);
        await expect(page.locator('html')).toHaveAttribute('lang', p.lang);
        await expect(page.locator('html')).toHaveClass(new RegExp(scheme));
        await expectNoAxeViolations(page);
      });

      test(`${p.path} overlays have no violations`, async ({ page }) => {
        await page.goto(p.path);

        await page.getByRole('button', { name: p.openDialog }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoAxeViolations(page, '[role="dialog"]');
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: p.openSheet }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoAxeViolations(page, '[role="dialog"]');
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: p.menu }).click();
        await expect(page.getByRole('menu')).toBeVisible();
        await expectNoAxeViolations(page, '[role="menu"]');
      });
    }
  });
}

test('keyboard focus is visible', async ({ page }) => {
  await page.goto('/design');
  const button = page.getByRole('button', { name: 'Send søknad' });
  await button.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
});

test('skip link moves focus to main content', async ({ page }) => {
  await page.goto('/design');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Gå til hovedinnhold' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});

test('data table sorts with aria-sort and filters by status', async ({ page }) => {
  await page.goto('/en/design');
  const table = page.getByRole('table', { name: 'Vendors, AFFN 2027' });
  const salesHeader = table.getByRole('columnheader', { name: 'Sales' });
  await expect(salesHeader).toHaveAttribute('aria-sort', 'none');
  // Number columns sort largest first, then ascending.
  await salesHeader.getByRole('button').click();
  await expect(salesHeader).toHaveAttribute('aria-sort', 'descending');
  await expect(table.getByRole('row').nth(1)).toContainText('Mama Afrika Kjøkken');
  await salesHeader.getByRole('button').click();
  await expect(salesHeader).toHaveAttribute('aria-sort', 'ascending');

  await page.getByRole('button', { name: 'Status' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Rejected/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('1 result', { exact: true })).toBeVisible();
  await expect(table.getByRole('row').nth(1)).toContainText('Kampala Rolex');
});

test.describe('theme toggle', () => {
  test.use({ colorScheme: 'light' });

  test('switches to dark and back, and remembers the choice', async ({ page }) => {
    await page.goto('/en/design');
    await page.getByRole('button', { name: 'Switch to dark theme' }).first().click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Switch to light theme' }).first().click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`app shells in ${scheme} mode, phone width`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 390, height: 844 } });

    for (const path of ['/', '/en/vendor', '/admin']) {
      test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
        await page.goto(path);
        await expectNoAxeViolations(page);

        const menuButton = page.getByRole('button', { name: /Åpne meny|Open menu/ });
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        const panel = page.locator(`[id="${await menuButton.getAttribute('aria-controls')}"]`);
        await menuButton.click();
        await expect(panel).toBeVisible();
        await expect(page.getByRole('button', { name: /Lukk meny|Close menu/ })).toHaveAttribute(
          'aria-expanded',
          'true',
        );
        await expectNoAxeViolations(page);

        // Escape closes the menu and returns focus to the button.
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(page.getByRole('button', { name: /Åpne meny|Open menu/ })).toBeFocused();
      });
    }
  });
}
