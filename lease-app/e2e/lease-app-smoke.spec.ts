import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/lease/e2e/mock.html');
  await expect(page.getByRole('heading',{name:'New Lease'})).toBeVisible();
});

test('fast configured-unit workflow creates an editable lease download', async ({ page }) => {
  await page.locator('#building').selectOption('building-multi');
  await expect(page.locator('#unit')).toHaveValue('');
  await page.locator('#unit').selectOption('unit-example-1');
  await expect(page.getByText('Leasing entity:')).toContainText('Example Holdings Inc.');
  await expect(page.locator('#rental-rate')).toHaveValue('1930');

  await page.getByPlaceholder('Full legal name / tenant text').fill('Ramírez López');
  await page.getByRole('button',{name:'+ Add another tenant'}).click();
  await page.getByPlaceholder('Additional tenant 2').fill('Jane MacDonald');
  await page.getByLabel('Fixed Term').check();
  await page.locator('#start-date').fill('2026-10-01');
  await expect(page.locator('#end-date')).toHaveValue('2027-09-30');

  await page.locator('#rental-rate').fill('1975');
  await expect(page.getByText('$1,975 · follows current rental rate')).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate Lease'})).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Generate Lease'}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('Lease_1-12_Example');
});

test('single-unit Building auto-selects and unknown terms remain blocked', async ({ page }) => {
  await page.locator('#building').selectOption('building-single');
  await expect(page.locator('#unit')).toHaveValue('unit-sample');

  await page.locator('#building').selectOption('building-multi');
  await page.locator('#unit').selectOption('unit-example-2');
  await page.getByPlaceholder('Full legal name / tenant text').fill('Test Tenant');
  await page.locator('#start-date').fill('2026-10-01');
  await expect(page.getByText('Not yet configured for this unit')).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate Lease'})).toBeDisabled();
});

test('end date is directly editable and can return to calculated value', async ({ page }) => {
  await page.locator('#building').selectOption('building-single');
  await page.getByLabel('Fixed Term').check();
  await page.locator('#start-date').fill('2026-10-01');
  await page.locator('#end-date').fill('2028-03-15');
  await expect(page.getByRole('button',{name:'Use calculated date'})).toBeVisible();
  await page.getByRole('button',{name:'Use calculated date'}).click();
  await expect(page.locator('#end-date')).toHaveValue('2027-09-30');
});

test('Manage is usable at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button',{name:'Manage'}).click();
  await expect(page.getByRole('heading',{name:'Manage'})).toBeVisible();
  await page.getByRole('button',{name:'Units'}).click();
  await expect(page.getByRole('heading',{name:'Units'})).toBeVisible();
});
