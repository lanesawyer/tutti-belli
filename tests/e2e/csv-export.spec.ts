/**
 * E2E tests for CSV export routes.
 * Uses the admin auth state (chromium-admin project).
 * Relies on seed data: "Chamber Orchestra" ensemble with admin@example.com as admin.
 */
import { test, expect, type Page } from '@playwright/test';

async function getEnsembleUrl(page: Page): Promise<string> {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  return page.url();
}

test('Export CSV button is visible on the members page', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();

  await page.goto(ensembleUrl + '/members');
  await expect(page.getByRole('link', { name: /export csv/i })).toBeVisible();
});

test('members CSV export returns a downloadable CSV file', async ({ page }) => {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  const ensembleId = ensembleUrl.split('/ensembles/')[1].split('/')[0];

  const response = await page.request.get(`/ensembles/${ensembleId}/export/members`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');
  expect(response.headers()['content-disposition']).toContain('attachment');

  const body = await response.text();
  const lines = body.split('\r\n');
  expect(lines[0]).toBe('Name,Email,Role,Parts,Joined');
  expect(lines.length).toBeGreaterThan(1);
});

test('Export CSV button is visible on the attendance page', async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  await page.goto(ensembleUrl + '/member-attendance');
  await expect(page.getByRole('link', { name: /export csv/i })).toBeVisible();
});

test('attendance CSV export returns a downloadable CSV file', async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  const ensembleId = ensembleUrl.split('/ensembles/')[1].split('/')[0];

  const response = await page.request.get(`/ensembles/${ensembleId}/export/attendance`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/csv');
  expect(response.headers()['content-disposition']).toContain('attachment');

  const body = await response.text();
  const lines = body.split('\r\n');
  expect(lines[0]).toBe('Name,Email,Role,Attended,Total Events,Attendance %');
  expect(lines.length).toBeGreaterThan(1);
});

test('attendance CSV export respects seasonId filter', async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  const ensembleId = ensembleUrl.split('/ensembles/')[1].split('/')[0];

  // Navigate to attendance page to find a season id from the filter dropdown
  await page.goto(ensembleUrl + '/member-attendance');
  const option = page.locator('#season-filter option').nth(1);
  const seasonId = await option.getAttribute('value');

  if (seasonId) {
    const response = await page.request.get(`/ensembles/${ensembleId}/export/attendance?seasonId=${seasonId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-disposition']).toContain('attachment');
    const lines = (await response.text()).split('\r\n');
    expect(lines[0]).toBe('Name,Email,Role,Attended,Total Events,Attendance %');
  }
});


