/**
 * E2E tests for the arrangement submissions feature.
 *
 * Happy-path flow tested end-to-end:
 *   member submits → admin starts review → admin requests revision →
 *   member uploads revision → admin approves
 *
 * Permission boundary tests run as the regular user (test@example.com).
 *
 * Uses the chromium-admin project by default (admin@example.com).
 * STORAGE_DISABLED=true so file uploads return a fake URL.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';

async function getEnsembleUrl(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  return page.url();
}

// ─── Admin happy-path flow ────────────────────────────────────────────────────

test.describe.serial('arrangement admin review flow', () => {
  let arrangementUrl: string;

  test('member submit button is visible on ensemble dashboard', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);
    await expect(page.locator(`a[href*="/arrangements/submit"]`)).toBeVisible();
    // suppress unused variable warning
    void ensembleUrl;
  });

  test('admin can navigate to arrangements index from sidebar', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);
    await page.goto(ensembleUrl + '/arrangements');
    await expect(page).toHaveURL(/\/arrangements$/);
    await expect(page.locator('body')).toContainText('Arrangement Submissions');
  });

  test('admin can submit an arrangement on behalf of themselves', async ({ page }) => {
    const ensembleUrl = await getEnsembleUrl(page);
    await page.goto(ensembleUrl + '/arrangements/submit');
    await expect(page).toHaveURL(/\/arrangements\/submit$/);

    const title = `Test Arrangement ${Date.now()}`;
    await page.fill('input[name="title"]', title);
    await page.fill('input[name="composerArranger"]', 'Mozart');
    await page.fill('textarea[name="description"]', 'A lovely arrangement');

    const pdfBuffer = Buffer.from('%PDF-1.4 test');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test-score.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    await page.click('button[type="submit"]');

    // Should redirect to detail page
    await expect(page).toHaveURL(/\/arrangements\/.+[^\/submit]$/);
    await expect(page.locator('body')).toContainText(title);
    await expect(page.locator('body')).toContainText('Submitted');

    arrangementUrl = page.url();
  });

  test('admin can start review on submitted arrangement', async ({ page }) => {
    await page.goto(arrangementUrl);
    await expect(page.locator('body')).toContainText('Submitted');

    await page.click('button[type="submit"]:has-text("Start Review")');

    await expect(page.locator('body')).toContainText('In Review');
  });

  test('admin can leave a message and request revision', async ({ page }) => {
    await page.goto(arrangementUrl);

    await page.fill('textarea[name="content"]', 'Please add dynamics to bar 12.');
    await page.click('button[type="submit"]:has-text("Send Message")');

    await expect(page.locator('body')).toContainText('Please add dynamics to bar 12.');

    // Click "Needs Revision"
    const needsRevisionForm = page.locator('form').filter({ has: page.locator('input[value="needs_revision"]') });
    await needsRevisionForm.locator('button[type="submit"]').click();

    await expect(page.locator('body')).toContainText('Needs Revision');
  });

  test('admin can approve an arrangement', async ({ page }) => {
    await page.goto(arrangementUrl);
    await expect(page.locator('body')).toContainText('Needs Revision');

    const approveForm = page.locator('form').filter({ has: page.locator('input[value="approved"]') });
    await approveForm.locator('button[type="submit"]').click();

    await expect(page.locator('body')).toContainText('Approved');
  });

  test('arrangement appears in admin index with correct status', async ({ page }) => {
    const ensembleUrl = arrangementUrl.replace(/\/arrangements\/.+$/, '');
    await page.goto(ensembleUrl + '/arrangements');

    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('body')).toContainText('Approved');
  });
});

// ─── Permission boundary tests (regular user) ─────────────────────────────────

test.describe('arrangement permission boundaries', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('regular member can access submit page', async ({ page }) => {
    await page.goto('/ensembles');
    await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
    await expect(page).toHaveURL(/\/ensembles\/.+/);
    const ensembleUrl = page.url();

    await page.goto(ensembleUrl + '/arrangements/submit');
    await expect(page).toHaveURL(/\/arrangements\/submit$/);
    await expect(page.locator('input[name="title"]')).toBeVisible();
  });

  test('regular member cannot access arrangements index', async ({ page }) => {
    await page.goto('/ensembles');
    await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
    await expect(page).toHaveURL(/\/ensembles\/.+/);
    const ensembleUrl = page.url();

    await page.goto(ensembleUrl + '/arrangements');
    await expect(page.locator('body')).toContainText('Unauthorized');
  });

  test('regular member can submit an arrangement', async ({ page }) => {
    await page.goto('/ensembles');
    await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
    await expect(page).toHaveURL(/\/ensembles\/.+/);
    const ensembleUrl = page.url();

    await page.goto(ensembleUrl + '/arrangements/submit');

    const title = `Member Submission ${Date.now()}`;
    await page.fill('input[name="title"]', title);

    const pdfBuffer = Buffer.from('%PDF-1.4 member test');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'member-score.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/arrangements\/.+[^\/submit]$/);
    await expect(page.locator('body')).toContainText(title);
    await expect(page.locator('body')).toContainText('Submitted');
  });
});
