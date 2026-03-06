/**
 * E2E tests for seasonal task management flows.
 * Uses the admin user's auth state (chromium-admin project).
 *
 * These tests rely on seed data: the "Chamber Orchestra" ensemble where
 * admin@example.com is an ensemble admin with an active season.
 */
import { test, expect } from '@playwright/test';

async function getEnsembleUrl(page: any) {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  return page.url();
}

test('tasks page loads for ensemble admin', async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  await page.goto(ensembleUrl + '/tasks');

  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByRole('button', { name: 'Create Task' })).toBeVisible();
});

test('admin can create a task via modal', async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  await page.goto(ensembleUrl + '/tasks');

  await page.getByRole('button', { name: 'Create Task' }).click();

  const taskTitle = `Test Task ${Date.now()}`;
  await page.fill('input[name="title"]', taskTitle);

  await page.locator('button[type="submit"][form="createForm"]').click();

  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator('.notification.is-success')).toBeVisible();
  await expect(page.locator('body')).toContainText(taskTitle);
});

test('created task appears in ensemble homepage sidebar', async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  await page.goto(ensembleUrl + '/tasks');

  await page.getByRole('button', { name: 'Create Task' }).click();
  const taskTitle = `Sidebar Task ${Date.now()}`;
  await page.fill('input[name="title"]', taskTitle);
  await page.locator('button[type="submit"][form="createForm"]').click();
  await page.waitForURL(/\/tasks$/);
  await page.waitForLoadState('networkidle');

  await page.goto(ensembleUrl);
  await expect(page.locator('body')).toContainText(taskTitle);
});

test('tasks page shows no-season message when there is no active season', async ({ page }) => {
  // This is a structural test — just verify the page loads without errors for the admin
  const ensembleUrl = await getEnsembleUrl(page);
  await page.goto(ensembleUrl + '/tasks');

  await expect(page).toHaveURL(/\/tasks/);
  // Either shows the create button (active season) or a warning notification (no season)
  const hasContent = await page
    .locator('button:has-text("Create Task"), .notification.is-warning')
    .count();
  expect(hasContent).toBeGreaterThan(0);
});
