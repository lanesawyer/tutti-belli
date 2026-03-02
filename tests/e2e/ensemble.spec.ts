/**
 * E2E tests for ensemble management flows.
 */
import { test, expect } from '@playwright/test';

test('admin can see the site admin panel', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL('/admin');
  await expect(page.locator('h1').first()).toContainText(/admin/i);
});

test('admin can view their ensembles list', async ({ page }) => {
  await page.goto('/ensembles');
  await expect(page).toHaveURL('/ensembles');
  await expect(page.locator('body')).toContainText('Chamber Orchestra');
});

test('admin can navigate to ensemble detail page', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('admin can access ensemble edit page', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  // Navigate directly via URL rather than clicking the navbar dropdown (which requires hover)
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/edit');
  await expect(page).toHaveURL(/\/edit/);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('user can create a new ensemble and is redirected to it', async ({ page }) => {
  await page.goto('/ensembles/new');
  await expect(page).toHaveURL('/ensembles/new');
  await page.fill('input[name="name"]', 'My Test Ensemble');
  await page.fill('textarea[name="description"]', 'A test ensemble created via e2e');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  await expect(page).not.toHaveURL('/ensembles/new');
});

test('custom link added on edit page appears in sidebar on ensemble homepage', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();

  await page.goto(ensembleUrl + '/edit');
  await expect(page).toHaveURL(/\/edit/);

  const linkLabel = `Sheet Music ${Date.now()}`;
  await page.fill('input[name="label"]', linkLabel);
  await page.fill('input[name="url"]', 'https://example.com/sheets');
  await page.locator('button[type="submit"][form="add-link-form"]').click();
  await expect(page.locator(`input[value*="${linkLabel}"]`).first()).toBeVisible();

  await page.goto(ensembleUrl);
  await expect(page.locator('body')).toContainText(linkLabel);
});

test('invite join page loads', async ({ page }) => {
  // The join page is public — test it loads without error
  const response = await page.goto('/invite/join');
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
});
