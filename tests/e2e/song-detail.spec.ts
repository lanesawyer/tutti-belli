/**
 * E2E tests for the song detail page.
 * Covers: resource display, audio player, PDF accordion, upload form, and delete modal.
 *
 * Uses the admin user's auth state. Relies on seed data: "Chamber Orchestra" ensemble
 * with admin@example.com as ensemble admin.
 */
import { test, expect } from '@playwright/test';

async function createSong(page: any, songName: string) {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/songs');
  await expect(page).toHaveURL(/\/songs/);

  await page.getByRole('button', { name: 'Add Song' }).first().click();
  await page.fill('input[name="name"]', songName);
  await page.locator('button[type="submit"][form="addForm"]').click();
  await expect(page).toHaveURL(/\/ensembles\/.+\/songs$/);

  await page.locator('a').filter({ hasText: songName }).first().click();
  await expect(page).toHaveURL(/\/songs\/.+/);
  return page.url();
}

test('song detail page loads and shows metadata', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/songs');
  await expect(page).toHaveURL(/\/songs/);

  await page.getByRole('button', { name: 'Add Song' }).first().click();

  const songName = `Detail Page Test ${Date.now()}`;
  await page.fill('input[name="name"]', songName);
  await page.fill('input[name="composer"]', 'Test Composer');
  await page.locator('button[type="submit"][form="addForm"]').click();
  await expect(page).toHaveURL(/\/ensembles\/.+\/songs$/);

  await page.locator('a').filter({ hasText: songName }).first().click();
  await expect(page).toHaveURL(/\/songs\/.+/);

  await expect(page.locator('body')).toContainText('Test Composer');
  await expect(page.locator('body')).toContainText('Resources');
  await expect(page.locator('body')).toContainText('No resources attached to this song yet');
});

test('admin sees upload resource form on song detail page', async ({ page }) => {
  const songName = `Upload Form Test ${Date.now()}`;
  await createSong(page, songName);

  await expect(page.locator('body')).toContainText('Upload Resource');
  await expect(page.locator('label.button', { hasText: 'Sheet Music' }).first()).toBeVisible();
  await expect(page.locator('label.button', { hasText: 'Rehearsal Track' }).first()).toBeVisible();
  await expect(page.locator('label.button', { hasText: 'Link' }).first()).toBeVisible();
});

test('admin can upload a link resource', async ({ page }) => {
  const songName = `Link Upload Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  // Select the Link type
  await page.locator('label#btn-link').click();

  // URL input should appear
  await expect(page.locator('input[name="fileUrl"]')).toBeVisible();
  await page.fill('input[name="fileUrl"]', 'https://youtu.be/dQw4w9WgXcQ');
  await page.fill('input[name="fileName"]', 'Rick Roll Reference');

  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();

  // Should redirect back to the song page after upload
  await expect(page).toHaveURL(songUrl);

  // The link resource should now appear in the links section
  await expect(page.locator('body')).toContainText('Rick Roll Reference');
  // YouTube embeds should have a "Show Video" toggle
  await expect(page.locator('summary').filter({ hasText: 'Show Video' })).toBeVisible();
});

test('link resource shows external link button', async ({ page }) => {
  const songName = `Link Button Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  await page.locator('label#btn-link').click();
  await page.fill('input[name="fileUrl"]', 'https://example.com/score');
  await page.fill('input[name="fileName"]', 'External Score');
  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();
  await expect(page).toHaveURL(songUrl);

  // External link button should be present
  await expect(page.locator('a[title="Open link"]').first()).toBeVisible();
});

test('PDF resource shows Show PDF accordion', async ({ page }) => {
  const songName = `PDF Accordion Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  // Create a minimal PDF-like file for upload
  const pdfBuffer = Buffer.from('%PDF-1.4 test');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'test-sheet.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });
  await page.fill('input[name="fileName"]', 'Test Sheet Music');
  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();
  await expect(page).toHaveURL(songUrl);

  // "Show PDF" accordion summary should appear in the PDF column
  await expect(page.locator('summary').filter({ hasText: 'Show PDF' })).toBeVisible();
});

test('delete modal appears when trash button is clicked', async ({ page }) => {
  const songName = `Delete Modal Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  // Upload a link so there's something to delete
  await page.locator('label#btn-link').click();
  await page.fill('input[name="fileUrl"]', 'https://example.com/to-delete');
  await page.fill('input[name="fileName"]', 'File To Delete');
  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();
  await expect(page).toHaveURL(songUrl);

  // Click the trash button
  await page.locator('button[aria-label="Delete"]').first().click();

  // The modal should appear with the file name and delete/cancel buttons
  await expect(page.locator('.modal.is-active')).toBeVisible();
  await expect(page.locator('.modal.is-active')).toContainText('File To Delete');
  await expect(page.locator('.modal.is-active button', { hasText: 'Delete' })).toBeVisible();
  await expect(page.locator('.modal.is-active button', { hasText: 'Cancel' })).toBeVisible();
});

test('delete modal can be cancelled without deleting', async ({ page }) => {
  const songName = `Cancel Delete Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  await page.locator('label#btn-link').click();
  await page.fill('input[name="fileUrl"]', 'https://example.com/keep-me');
  await page.fill('input[name="fileName"]', 'Keep Me');
  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();
  await expect(page).toHaveURL(songUrl);

  await page.locator('button[aria-label="Delete"]').first().click();
  await expect(page.locator('.modal.is-active')).toBeVisible();

  // Cancel closes the modal without deleting
  await page.locator('.modal.is-active button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.modal')).not.toHaveClass(/is-active/);
  await expect(page.locator('body')).toContainText('Keep Me');
});

test('admin can delete a resource via the modal', async ({ page }) => {
  const songName = `Confirm Delete Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  await page.locator('label#btn-link').click();
  await page.fill('input[name="fileUrl"]', 'https://example.com/delete-me');
  await page.fill('input[name="fileName"]', 'Delete Me');
  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();
  await expect(page).toHaveURL(songUrl);
  await expect(page.locator('body')).toContainText('Delete Me');

  // Open modal and confirm delete
  await page.locator('button[aria-label="Delete"]').first().click();
  await expect(page.locator('.modal.is-active')).toBeVisible();

  // Firefox: wait for modal to be visible before submitting
  await expect(page.locator('.modal.is-active button[type="submit"]', { hasText: 'Delete' })).toBeVisible();
  await page.locator('.modal.is-active button[type="submit"]', { hasText: 'Delete' }).click();

  // Should redirect back to the song page and the resource should be gone
  await expect(page).toHaveURL(songUrl);
  await expect(page.locator('body')).not.toContainText('Delete Me');
});

test('audio player renders for MP3 resources', async ({ page }) => {
  const songName = `Audio Player Test ${Date.now()}`;
  const songUrl = await createSong(page, songName);

  // Upload a minimal MP3-like file
  const mp3Buffer = Buffer.from('ID3fake mp3 content');
  await page.locator('label#btn-rehearsal_track').click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'test-track.mp3',
    mimeType: 'audio/mpeg',
    buffer: mp3Buffer,
  });
  await page.fill('input[name="fileName"]', 'Test Rehearsal Track');
  await page.locator('button[type="submit"]').filter({ hasText: 'Upload' }).click();
  await expect(page).toHaveURL(songUrl);

  // The custom audio player should be rendered (not a raw <audio> element)
  await expect(page.locator('[data-audio-player]')).toBeVisible();
  // Play/pause button
  await expect(page.locator('.audio-play-pause')).toBeVisible();
  // Back and forward 15s buttons
  await expect(page.locator('.audio-back')).toBeVisible();
  await expect(page.locator('.audio-forward')).toBeVisible();
  // Seek bar
  await expect(page.locator('.audio-seek')).toBeVisible();
  // Time displays
  await expect(page.locator('.audio-current')).toBeVisible();
  await expect(page.locator('.audio-duration')).toBeVisible();
});
