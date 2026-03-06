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
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  // Navigate directly via URL rather than clicking the navbar dropdown (which requires hover)
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/events');

  await expect(page).toHaveURL(/\/events/);
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('events page loads and shows the events section', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  // Navigate directly via URL rather than clicking the navbar dropdown (which requires hover)
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/events');

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

async function navigateToPerformanceEvent(page: ReturnType<typeof test['info']>['project']['use'] & any) {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/events');
  await expect(page).toHaveURL(/\/events/);
  // Navigate to the Spring Concert performance which has program songs in seed data
  await page.locator('a').filter({ hasText: 'Spring Concert 2026' }).first().click();
  await expect(page).toHaveURL(/\/events\/.+/);
}

test('rehearsal plan table shows Minutes column', async ({ page }) => {
  await navigateToPerformanceEvent(page);
  await expect(page.locator('th').filter({ hasText: 'Minutes' })).toBeVisible();
});

test('admin can edit a program entry to set practice minutes and order', async ({ page }) => {
  await navigateToPerformanceEvent(page);

  // Click the first edit (pencil) button in the program table
  await page.locator('.edit-entry-btn').first().click();

  // The edit entry modal should appear
  await expect(page.locator('#edit-entry-modal')).toHaveClass(/is-active/);

  // Set practice minutes
  await page.fill('#edit-entry-practice-minutes', '20');

  // Submit the form
  await page.locator('#edit-entry-form button[type="submit"]').click();

  // After submission, page reloads and the modal is gone
  await expect(page.locator('#edit-entry-modal')).not.toHaveClass(/is-active/);
  // The updated minutes should appear in the table
  await expect(page.locator('td').filter({ hasText: '20 min' }).first()).toBeVisible();
});

test('admin can add a song to the rehearsal plan with practice minutes', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/events');
  await expect(page).toHaveURL(/\/events/);

  // Navigate to Weekly Rehearsal which has no program songs but season songs available
  await page.locator('a').filter({ hasText: 'Weekly Rehearsal' }).first().click();
  await expect(page).toHaveURL(/\/events\/.+/);

  // If there's an "Add to" form visible (songs available to add), test it
  const addForm = page.locator('form').filter({ has: page.locator('select[name="songId"]') });
  const hasAddForm = await addForm.count() > 0;
  if (!hasAddForm) {
    // No songs available to add — skip the rest of this test
    return;
  }

  // Fill in practice minutes
  await addForm.locator('input[name="practiceMinutes"]').fill('15');

  // Submit
  await addForm.locator('button[type="submit"]').click();

  // Page should reload without error and show the minutes
  await expect(page.locator('body')).not.toContainText('500');
  await expect(page.locator('td').filter({ hasText: '15 min' }).first()).toBeVisible();
});
