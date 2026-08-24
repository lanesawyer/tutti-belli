/**
 * E2E tests for arrangement submission and review flows.
 * Uses the admin user's auth state (chromium-admin project).
 *
 * Relies on seed data: the "Chamber Orchestra" ensemble where
 * admin@example.com is an ensemble admin.
 */
import { test, expect } from '@playwright/test';

async function navigateToArrangements(page: ReturnType<typeof test['info']>['project']['use'] & any) {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/arrangements');
  await expect(page).toHaveURL(/\/arrangements/);
}

const testPdf = {
  name: 'e2e-arrangement.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%e2e test arrangement\n'),
};

test('arrangements page loads for an ensemble admin', async ({ page }) => {
  await navigateToArrangements(page);

  await expect(page.getByRole('button', { name: 'Submit Arrangement' }).first()).toBeVisible();
  // Admins see the review group assignment box
  await expect(page.locator('body')).toContainText('Review Group');
});

test('member can submit an arrangement and it appears in review', async ({ page }) => {
  await navigateToArrangements(page);

  await page.getByRole('button', { name: 'Submit Arrangement' }).first().click();

  const title = `E2E Arrangement ${Date.now()}`;
  await page.fill('#submit-modal input[name="title"]', title);
  await page.fill('#submit-modal input[name="composer"]', 'E2E Composer');
  await page.setInputFiles('#submit-modal input[name="file"]', testPdf);

  await page.locator('button[type="submit"][form="submitArrangementForm"]').click();

  // Successful submit redirects to the arrangement detail page
  await expect(page).toHaveURL(/\/arrangements\/[0-9a-f-]+$/);
  await expect(page.locator('body')).toContainText(title);
  await expect(page.locator('body')).toContainText('In Review');
  await expect(page.locator('body')).toContainText('v1');

  // The PDF viewer starts collapsed and only expands when the reviewer asks for it
  const viewer = page.locator('embed[type="application/pdf"]');
  await expect(viewer).toHaveAttribute('src', /\/arrangement-files\/[0-9a-f-]+\?inline/);
  await expect(page.locator('details[open]')).toHaveCount(0);

  await page.getByText('Show PDF').first().click();
  await expect(page.locator('details[open] embed[type="application/pdf"]')).toHaveCount(1);
});

test('reviewer can leave feedback on an arrangement', async ({ page }) => {
  await navigateToArrangements(page);

  await page.getByRole('button', { name: 'Submit Arrangement' }).first().click();
  const title = `E2E Feedback ${Date.now()}`;
  await page.fill('#submit-modal input[name="title"]', title);
  await page.setInputFiles('#submit-modal input[name="file"]', testPdf);
  await page.locator('button[type="submit"][form="submitArrangementForm"]').click();
  await expect(page).toHaveURL(/\/arrangements\/[0-9a-f-]+$/);

  const feedback = `Great voicing, check bar 12 (${Date.now()})`;
  await page.fill('textarea[name="content"]', feedback);
  await page.getByRole('button', { name: 'Post Feedback' }).click();

  await expect(page.locator('body')).toContainText(feedback);
});

test('approving an arrangement adopts it into the song library', async ({ page }) => {
  await navigateToArrangements(page);

  await page.getByRole('button', { name: 'Submit Arrangement' }).first().click();
  const title = `E2E Adopted ${Date.now()}`;
  await page.fill('#submit-modal input[name="title"]', title);
  await page.fill('#submit-modal input[name="arranger"]', 'E2E Arranger');
  await page.setInputFiles('#submit-modal input[name="file"]', testPdf);
  await page.locator('button[type="submit"][form="submitArrangementForm"]').click();
  await expect(page).toHaveURL(/\/arrangements\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'Approve' }).click();
  await page.locator('button[type="submit"][form="approveForm"]').click();

  // Approval redirects to the new song's page in the library
  await expect(page).toHaveURL(/\/songs\/[0-9a-f-]+$/);
  await expect(page.locator('body')).toContainText(title);
});

test('uploading a new version increments the version list', async ({ page }) => {
  await navigateToArrangements(page);

  await page.getByRole('button', { name: 'Submit Arrangement' }).first().click();
  const title = `E2E Versioned ${Date.now()}`;
  await page.fill('#submit-modal input[name="title"]', title);
  await page.setInputFiles('#submit-modal input[name="file"]', testPdf);
  await page.locator('button[type="submit"][form="submitArrangementForm"]').click();
  await expect(page).toHaveURL(/\/arrangements\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'New Version' }).click();
  await page.setInputFiles('#version-modal input[name="file"]', {
    ...testPdf,
    name: 'e2e-arrangement-v2.pdf',
  });
  await page.fill('#version-modal textarea[name="notes"]', 'Second pass');
  await page.locator('button[type="submit"][form="versionForm"]').click();

  await expect(page).toHaveURL(/\/arrangements\/[0-9a-f-]+$/);
  await expect(page.locator('body')).toContainText('v2');
  await expect(page.locator('body')).toContainText('Second pass');
});
