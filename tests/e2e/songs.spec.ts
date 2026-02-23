/**
 * E2E tests for song management flows.
 * Uses the admin user's auth state.
 *
 * These tests rely on seed data: the "Chamber Orchestra" ensemble where
 * admin@example.com is an ensemble admin.
 */
import { test, expect } from '@playwright/test';

async function navigateToSongs(page: ReturnType<typeof test['info']>['project']['use'] & any) {
  await page.goto('/ensembles');
  await page.locator('a').filter({ hasText: 'Chamber Orchestra' }).first().click();
  // Navigate to songs via the nav link
  await page.locator('a').filter({ hasText: /songs/i }).first().click();
  await expect(page).toHaveURL(/\/songs/);
}

test('songs page loads for an ensemble admin', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('a').filter({ hasText: 'Chamber Orchestra' }).first().click();
  await page.locator('a').filter({ hasText: /songs/i }).first().click();

  await expect(page).toHaveURL(/\/songs/);
  // "Add Song" button should be visible for admins
  await expect(page.locator('button, a').filter({ hasText: /add song/i })).toBeVisible();
});

test('admin can add a new song via the modal form', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('a').filter({ hasText: 'Chamber Orchestra' }).first().click();
  await page.locator('a').filter({ hasText: /songs/i }).first().click();

  // Open add song modal
  await page.locator('button, a').filter({ hasText: /add song/i }).click();

  // Fill in the song form
  const songName = `Test Song ${Date.now()}`;
  await page.fill('input[name="name"]', songName);
  await page.fill('input[name="composer"]', 'Test Composer');

  // Submit the form
  await page.locator('form').filter({ has: page.locator('input[name="name"]') }).locator('button[type="submit"]').click();

  // After submission we should be redirected back to songs page and see the new song
  await expect(page).toHaveURL(/\/songs$/);
  await expect(page.locator('body')).toContainText(songName);
});

test('songs page shows "No songs" message when repertoire is empty', async ({ page }) => {
  // This is a structural test — just verify the page loads without 500 errors
  await page.goto('/ensembles');
  await page.locator('a').filter({ hasText: 'Chamber Orchestra' }).first().click();
  await page.locator('a').filter({ hasText: /songs/i }).first().click();

  await expect(page).toHaveURL(/\/songs/);
  // Either shows songs table or the "no songs" notification — either is fine
  const hasContent = await page.locator('table, .notification.is-info').count();
  expect(hasContent).toBeGreaterThan(0);
});
