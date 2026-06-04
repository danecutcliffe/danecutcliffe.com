import { expect, test, type Page } from '@playwright/test';

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Time Clock' })).toBeVisible();
  await expect(page.locator('.app-shell-content')).toBeVisible();
}

async function expectNoDocumentOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    htmlScrollWidth: document.documentElement.scrollWidth,
    htmlClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(metrics.htmlScrollWidth, 'documentElement must not create horizontal page scroll').toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyScrollWidth, 'body must not create horizontal page scroll').toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.htmlClientWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyClientWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectMobileShellContract(page: Page) {
  const shell = await page.locator('.app-shell').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { display: style.display, flexDirection: style.flexDirection, overflow: style.overflow };
  });
  const content = await page.locator('.app-shell-content').first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { overflowX: style.overflowX, overflowY: style.overflowY, minHeight: style.minHeight };
  });
  const nav = await page.locator('.app-mobile-bottom-nav').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return { bottom: rect.bottom, position: style.position, width: rect.width };
  });

  expect(shell.display).toBe('flex');
  expect(shell.flexDirection).toBe('column');
  expect(shell.overflow).toBe('hidden');
  expect(content.overflowX).toBe('hidden');
  expect(content.overflowY).toBe('auto');
  expect(content.minHeight).toBe('0px');
  expect(nav.position).toBe('relative');
  expect(nav.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
  expect(nav.bottom).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight + 1));
}

async function clickAppTab(page: Page, name: string, isMobile: boolean) {
  const navigation = page.getByRole('navigation', { name: isMobile ? 'Mobile navigation' : 'Main navigation' });
  await navigation.getByRole('button', { name }).click();
}

test.describe('Time app smoke and layout contract', () => {
  test('loads employee clock, timesheets, and settings without page-level overflow', async ({ page, isMobile }) => {
    await waitForApp(page);
    await expect(page.getByText('Jamie Carpenter')).toBeVisible();
    await expectNoDocumentOverflow(page);
    if (isMobile) await expectMobileShellContract(page);

    await clickAppTab(page, 'Timesheets', isMobile);
    await expect(page.locator('#daily-breakdown')).toBeVisible();
    await expectNoDocumentOverflow(page);

    await clickAppTab(page, 'Settings', isMobile);
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    await expectNoDocumentOverflow(page);
  });

  test('loads admin dashboard and payroll-facing reports without page-level overflow', async ({ page, isMobile }) => {
    await waitForApp(page);
    await page.getByRole('button', { name: 'admin' }).click();
    await expect(page.locator('#period-readiness')).toBeVisible();
    await expectNoDocumentOverflow(page);
    if (isMobile) await expectMobileShellContract(page);

    await clickAppTab(page, 'Timesheets', isMobile);
    await expect(page.locator('#ts-summary')).toBeVisible();
    await expectNoDocumentOverflow(page);

    if (!isMobile) {
      await clickAppTab(page, 'Reports', isMobile);
      await expect(page.locator('#payroll-export')).toBeVisible();
      await expectNoDocumentOverflow(page);
    }
  });
});
