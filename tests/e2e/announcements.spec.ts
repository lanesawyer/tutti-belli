/**
 * E2E tests for the announcements feature, including the Discord webhook integration.
 * Runs as admin (chromium-admin project).
 */
import { test, expect } from '@playwright/test';

async function getEnsembleUrl(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  return page.url();
}

test.describe.serial('announcements', () => {
  test.beforeAll(async ({ browser }) => {
    // Clean up any leftover webhook URL from previous runs.
    // Must pass storageState so the page is authenticated as admin.
    const context = await browser.newContext({
      storageState: 'tests/e2e/.auth/admin.json',
    });
    const page = await context.newPage();
    await page.goto('/ensembles/chamber-orchestra/edit');
    await page.fill('input[name="discordWebhookUrl"]', '');
    await page.click('button[type="submit"]:not([form])');
    await expect(page).not.toHaveURL(/\/edit/);
    await context.close();
  });

  test('admin can create an announcement', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);
    await page.goto(ensembleUrl + '/announcements');

    await page.click('#create-announcement-btn');
    await expect(page.locator('#create-modal')).toHaveClass(/is-active/);

    await page.fill('#create-title', 'Test Announcement');
    await page.fill('#create-content', 'This is a test announcement body.');
    await page.click('button[type="submit"][form="createForm"]');

    await expect(page.locator('.notification.is-success')).toBeVisible();
    await expect(page.locator('body')).toContainText('Test Announcement');
  });

  test('Post to Discord checkbox is hidden when no webhook URL is configured', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);

    // Ensure no webhook is set
    await page.goto(ensembleUrl + '/edit');
    await page.fill('input[name="discordWebhookUrl"]', '');
    await page.click('button[type="submit"]:not([form])');
    await expect(page).not.toHaveURL(/\/edit/);

    const currentUrl = page.url();
    await page.goto(currentUrl + '/announcements');
    await page.click('#create-announcement-btn');
    await expect(page.locator('#create-modal')).toHaveClass(/is-active/);
    await expect(page.locator('#create-modal input[name="postToDiscord"]')).not.toBeVisible();
  });

  test('Post to Discord checkbox appears when a webhook URL is configured', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);

    // Set a (fake) webhook URL on the ensemble
    await page.goto(ensembleUrl + '/edit');
    await page.fill('input[name="discordWebhookUrl"]', 'https://discord.com/api/webhooks/000/fake-test-url');
    await page.click('button[type="submit"]:not([form])');
    await expect(page).not.toHaveURL(/\/edit/);

    const currentUrl = page.url();
    await page.goto(currentUrl + '/announcements');
    await page.click('#create-announcement-btn');
    await expect(page.locator('#create-modal')).toHaveClass(/is-active/);
    await expect(page.locator('#create-modal input[name="postToDiscord"]')).toBeVisible();
  });

  test('creating an announcement with Post to Discord checked succeeds even with a fake webhook', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);
    await page.goto(ensembleUrl + '/announcements');

    await page.click('#create-announcement-btn');
    await expect(page.locator('#create-modal')).toHaveClass(/is-active/);

    await page.fill('#create-title', 'Discord Test Announcement');
    await page.fill('#create-content', 'Posted with Discord checked.');
    await page.check('#create-modal input[name="postToDiscord"]');
    await page.click('button[type="submit"][form="createForm"]');

    // Announcement creation succeeds — Discord failure is fire-and-forget
    await expect(page.locator('.notification.is-success')).toBeVisible();
    await expect(page.locator('body')).toContainText('Discord Test Announcement');
  });

});
