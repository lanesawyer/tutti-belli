/**
 * E2E tests for the site-wide banner feature.
 * Runs as admin (chromium-admin project).
 */
import { test, expect } from '@playwright/test';

async function submitBanner(page: import('@playwright/test').Page) {
  await page.click('button[type="submit"][form="set-banner-form"]');
  // Wait for the action to complete — the success notification confirms the page re-rendered
  await expect(page.locator('.notification.is-success')).toBeVisible();
}

async function clearBanner(page: import('@playwright/test').Page) {
  await page.click('button[type="submit"][form="clear-banner-form"]');
  await expect(page.locator('.notification.is-success')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Clear any active banner before each test so tests are isolated
  await page.goto('/admin');
  const clearBtn = page.locator('button[type="submit"][form="clear-banner-form"]');
  if (await clearBtn.isVisible()) {
    await clearBanner(page);
  }
});

test('admin can set a banner and it appears on all pages', async ({ page }) => {
  await page.goto('/admin');

  await page.fill('input[name="message"]', 'Rehearsal cancelled this Friday');
  await page.selectOption('select[name="color"]', 'warning');
  await submitBanner(page);

  // Banner should show on the admin page itself
  await expect(page.locator('#site-banner')).toContainText('Rehearsal cancelled this Friday');

  // Banner should show on another page (full SSR reload)
  await page.goto('/ensembles');
  await expect(page.locator('#site-banner')).toContainText('Rehearsal cancelled this Friday');
});

test('admin can clear the banner and it disappears', async ({ page }) => {
  // Set a banner first
  await page.goto('/admin');
  await page.fill('input[name="message"]', 'Temporary notice');
  await submitBanner(page);
  await expect(page.locator('#site-banner')).toBeVisible();

  // Clear it
  await clearBanner(page);
  await expect(page.locator('#site-banner')).not.toBeVisible();

  // Verify it's gone on another page too
  await page.goto('/ensembles');
  await expect(page.locator('#site-banner')).not.toBeVisible();
});

test('admin can update an existing banner', async ({ page }) => {
  await page.goto('/admin');

  await page.fill('input[name="message"]', 'Original message');
  await submitBanner(page);

  await page.fill('input[name="message"]', 'Updated message');
  await page.selectOption('select[name="color"]', 'danger');
  await submitBanner(page);

  await expect(page.locator('#site-banner')).toContainText('Updated message');
  await expect(page.locator('#site-banner')).toHaveClass(/site-banner-danger/);
});

test('banner is visible to regular users when set', async ({ page }) => {
  await page.goto('/admin');
  await page.fill('input[name="message"]', 'Notice for all members');
  await submitBanner(page);

  // The public home page should also show the banner (no auth required to see it)
  await page.goto('/');
  await expect(page.locator('#site-banner')).toContainText('Notice for all members');
});
