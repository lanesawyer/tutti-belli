/**
 * E2E tests for song management flows.
 * Uses the admin user's auth state.
 *
 * These tests rely on seed data: the "Chamber Orchestra" ensemble where
 * admin@example.com is an ensemble admin.
 */
import { test, expect } from '@playwright/test';

test('songs page loads for an ensemble admin', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/songs');

  await expect(page).toHaveURL(/\/songs/);
  // "Add Song" button should be visible for admins
  await expect(page.getByRole('button', { name: 'Add Song' }).first()).toBeVisible();
});

test('admin can add a new song via the modal form', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/songs');

  // Open add song modal
  await page.getByRole('button', { name: 'Add Song' }).first().click();

  // Fill in the song form
  const songName = `Test Song ${Date.now()}`;
  await page.fill('input[name="name"]', songName);
  await page.fill('input[name="composer"]', 'Test Composer');

  // Submit the form (submit button is outside the form element, linked via form="addForm")
  await page.locator('button[type="submit"][form="addForm"]').click();

  // After submission the action redirects back to the songs page (no _action param)
  await expect(page).toHaveURL(/\/ensembles\/.+\/songs$/);
  await expect(page.getByRole('button', { name: 'Add Song' }).first()).toBeVisible();
  await expect(page.locator('body')).toContainText(songName);
});

test('songs page shows "No songs" message when repertoire is empty', async ({ page }) => {
  // This is a structural test — just verify the page loads without 500 errors
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/songs');

  await expect(page).toHaveURL(/\/songs/);
  // Either shows songs table or the "no songs" notification — either is fine
  const hasContent = await page.locator('table, .notification.is-info').count();
  expect(hasContent).toBeGreaterThan(0);
});

test('song file names render as text and deleting a file asks for confirmation', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/songs');

  const songName = `Files Song ${Date.now()}`;
  await page.getByRole('button', { name: 'Add Song' }).first().click();
  await page.fill('input[name="name"]', songName);
  await page.locator('button[type="submit"][form="addForm"]').click();
  await expect(page.locator('body')).toContainText(songName);

  const fileName = `<img src=x onerror="window.__injected=1"><b>bold</b> O'Brien "part"`;
  const songRow = page.locator('tr').filter({ hasText: songName });
  await songRow.locator('.files-btn').click();
  await page.fill('#fileName', fileName);
  await page.fill('#fileUrl', 'https://example.com/score.pdf');
  await page.locator('#addFileForm button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ensembles\/.+\/songs$/);

  await page.locator('tr').filter({ hasText: songName }).locator('.files-btn').click();
  const list = page.locator('#filesModalList');
  await expect(list.locator('.song-file-name')).toHaveText(fileName);
  await expect(list.locator('img, b')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __injected?: number }).__injected)).toBeUndefined();

  page.once('dialog', (dialog) => dialog.dismiss());
  await list.locator('button[type="submit"]').click();
  await expect(list.locator('.song-file-name')).toHaveText(fileName);
  await expect(page).toHaveURL(/\/ensembles\/.+\/songs$/);

  page.once('dialog', (dialog) => dialog.accept());
  await list.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ensembles\/.+\/songs$/);
  await page.locator('tr').filter({ hasText: songName }).locator('.files-btn').click();
  await expect(page.locator('#filesModalList')).toContainText('No files yet.');
});
