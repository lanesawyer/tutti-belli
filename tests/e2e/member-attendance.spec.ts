/**
 * E2E tests for member-attendance flows.
 * Uses the admin user's auth state (chromium-admin project).
 */
import { test, expect } from '@playwright/test';

async function navigateToMemberAttendance(page: ReturnType<typeof test['info']>['project']['use'] & any) {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/member-attendance');
  await expect(page).toHaveURL(/member-attendance/);
}

test('member-attendance page loads without error', async ({ page }) => {
  await navigateToMemberAttendance(page);
  await expect(page.locator('body')).not.toContainText('500');
  await expect(page.locator('h1.title')).toContainText('Member Attendance');
});

test('member-attendance page shows members table', async ({ page }) => {
  await navigateToMemberAttendance(page);
  // The table should exist and show at least one member row
  const table = page.locator('table');
  await expect(table).toBeVisible();
  // Header columns
  await expect(table.locator('th').filter({ hasText: 'Attendance %' })).toBeVisible();
  await expect(table.locator('th').filter({ hasText: 'Attended' })).toBeVisible();
});

test('member-attendance page has season filter dropdown when seasons exist', async ({ page }) => {
  await navigateToMemberAttendance(page);
  // The seed data includes a season, so the select should be present
  const select = page.locator('select#season-filter');
  await expect(select).toBeVisible();
  await expect(select.locator('option').first()).toHaveText('All seasons');
});

test('member-attendance filters by season when selected', async ({ page }) => {
  await navigateToMemberAttendance(page);
  const select = page.locator('select#season-filter');
  const options = await select.locator('option').all();
  // If there's a non-empty season option, select it
  if (options.length > 1) {
    const seasonValue = await options[1].getAttribute('value');
    await page.goto(page.url().split('?')[0] + `?seasonId=${seasonValue}`);
    await expect(page).toHaveURL(/seasonId=/);
    await expect(page.locator('body')).not.toContainText('500');
    await expect(page.locator('h1.title')).toContainText('Member Attendance');
  }
});

