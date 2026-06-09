import { expect, test, type Page } from '@playwright/test';

function getAtlanticTodayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Halifax',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

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
    await expect(page.locator('#working-now')).toBeVisible();
    await expect(page.locator('#pay-period-snapshot')).toBeVisible();
    await expect(page.locator('#needs-review')).toBeVisible();
    await expect(page.getByText('Is this pay period ready for payroll review?')).toHaveCount(0);
    await expectNoDocumentOverflow(page);
    if (isMobile) await expectMobileShellContract(page);

    await page.locator('#working-now').getByRole('button', { name: 'Review Timesheet' }).first().click();
    await expect(page.locator('#employee-select')).toHaveValue('profile-stress-long');
    await clickAppTab(page, 'Dashboard', isMobile);

    if (!isMobile) {
      await clickAppTab(page, 'Reports', isMobile);
      await expect(page.locator('#payroll-export')).toBeVisible();
      await expect(page.getByText('STRESS-LONG-JOB-CODE-0001').first()).toBeVisible();
      await expectNoDocumentOverflow(page);
    }

    await clickAppTab(page, 'Timesheets', isMobile);
    await expect(page.locator('#ts-summary')).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.locator('#employee-select').selectOption('profile-stress-long');
    await expect(page.locator('#employee-select')).toHaveValue('profile-stress-long');
    await expectNoDocumentOverflow(page);

    await page.locator('#employee-select').selectOption('profile-stress-empty');
    await expect(page.getByText('No entries for this week.')).toHaveCount(1);
    await expect(page.locator('#ts-entries').getByText(/Week of /).first()).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.getByRole('button', { name: 'Add Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: /Manual entry for No-Entries-Yet/ })).toBeVisible();
    const manualEntryModal = page.locator('.fixed');
    const today = getAtlanticTodayKey();
    await expect(manualEntryModal.getByLabel('Punch in date')).toHaveValue(today);
    await expect(manualEntryModal.getByLabel('Punch in time')).toHaveValue('');
    await expect(manualEntryModal.getByLabel('Punch out date')).toHaveValue(today);
    await expect(manualEntryModal.getByLabel('Punch out time')).toHaveValue('');
    await expect(manualEntryModal.getByRole('button', { name: 'Add Entry' })).toBeDisabled();
    const priorDay = addDaysToDateKey(today, -2);
    await manualEntryModal.getByLabel('Punch in date').fill(priorDay);
    await expect(manualEntryModal.getByLabel('Punch out date')).toHaveValue(priorDay);
    await manualEntryModal.getByLabel('Punch in date').fill(today);
    await expect(manualEntryModal.getByLabel('Punch out date')).toHaveValue(today);
    await manualEntryModal.getByRole('button', { name: 'Break' }).click();
    await expect(manualEntryModal.getByLabel('Break start date')).toHaveValue(today);
    await expect(manualEntryModal.getByLabel('Break start time')).toHaveValue('');
    await manualEntryModal.getByRole('button', { name: 'Work' }).click();
    await page.locator('.fixed').getByRole('combobox').selectOption('job-stress-long');
    await expectNoDocumentOverflow(page);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.fixed')).toHaveCount(0);
  });
});
