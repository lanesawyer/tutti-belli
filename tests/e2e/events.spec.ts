/**
 * E2E tests for event management flows.
 * Uses the admin user's auth state.
 *
 * These tests use the seed data:
 * - "Chamber Orchestra" ensemble (slug: chamber-orchestra or similar)
 * - admin@example.com is a site admin and ensemble admin
 */
import { test, expect } from '@playwright/test';

// Admin storageState is set in playwright.config.ts for the chromium-admin project

test('admin can navigate to the events list page', async ({ page }) => {
  await page.goto('/ensembles');
  // Find the Chamber Orchestra link and navigate to its events
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\//);

  await page.locator('a', { hasText: /events/i }).first().click();
  await expect(page).toHaveURL(/\/events/);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('events page loads and shows the events section', async ({ page }) => {
  // Navigate directly — use the known seed ensemble slug
  await page.goto('/ensembles');
  const ensembleLink = page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first();
  await ensembleLink.click();

  const eventsLink = page.locator('nav a, a').filter({ hasText: /events/i }).first();
  await eventsLink.click();

  await expect(page).toHaveURL(/\/events/);
  // Events list page should load without error
  await expect(page.locator('body')).not.toContainText('500');
});

test('/checkin/[code] page loads for a valid-format code', async ({ page }) => {
  // The seed data creates an event with a check-in code — we just verify the page loads
  // We test with a fake code to confirm the page renders (it will show "Invalid code" UI)
  const response = await page.goto('/checkin/FAKECODE');
  // Should not be a 500 error — page renders even for invalid codes
  expect(response?.status()).toBeLessThan(500);
});
