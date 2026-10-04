/**
 * E2E tests for auditions: an admin posts one, a member signs up, the admin selects them and
 * posts results. Runs as admin (chromium-admin project), with a second context for the member.
 */
import { test, expect, type Page } from '@playwright/test';

const AUDITIONS_URL = '/ensembles/chamber-orchestra/auditions';

function auditionBox(page: Page, title: string) {
  return page.locator('[id^="audition-"]').filter({ hasText: title });
}

test('admin posts an audition, a member signs up, and sees they were selected', async ({ page, browser }, workerInfo) => {
  const title = `E2E solo ${workerInfo.project.name} ${Date.now()}`;

  await page.goto(AUDITIONS_URL);
  if (!(await page.locator('input[name="title"]').first().isVisible())) {
    await page.getByText('New Audition', { exact: true }).click();
  }
  await page.locator('form[action*="auditions.create"] input[name="title"]').fill(title);
  await page.getByRole('button', { name: 'Create Audition' }).click();
  await expect(page.locator('.notification.is-success')).toContainText('Audition created.');

  const memberContext = await browser.newContext({ storageState: 'tests/e2e/.auth/user.json' });
  const member = await memberContext.newPage();
  await member.goto(AUDITIONS_URL);
  await auditionBox(member, title).locator('textarea[name="note"]').fill('Happy to sing it');
  await auditionBox(member, title).getByRole('button', { name: 'Sign Up' }).click();
  await expect(member.locator('.notification.is-success')).toContainText("You're signed up.");
  await expect(auditionBox(member, title)).not.toContainText('Test User');

  await page.goto(AUDITIONS_URL);
  const signupRow = auditionBox(page, title).locator('tr', { hasText: 'Test User' });
  await expect(signupRow).toContainText('Happy to sing it');

  const ensembleId = await page.locator('input[name="ensembleId"]').first().inputValue();
  const signupId = await signupRow.locator('input[name="signupId"]').first().inputValue();
  const memberSelectStatus = await member.evaluate(async ([ensembleId, signupId]) => {
    const form = new FormData();
    form.append('ensembleId', ensembleId);
    form.append('signupId', signupId);
    form.append('selected', 'true');
    return (await fetch('/_actions/auditions.setSelected', { method: 'POST', body: form })).status;
  }, [ensembleId, signupId]);
  expect(memberSelectStatus).toBe(403);

  await signupRow.getByRole('button', { name: 'Select' }).click();
  await expect(page.locator('.notification.is-success')).toContainText('Selection saved.');
  await auditionBox(page, title).getByRole('button', { name: 'Close & Post Results' }).click();
  await expect(page.locator('.notification.is-success')).toContainText('Audition updated.');

  await member.goto(AUDITIONS_URL);
  await expect(auditionBox(member, title)).toContainText('You were selected!');
  await expect(auditionBox(member, title)).toContainText('Selected: Test User');
  await memberContext.close();

  await page.goto(AUDITIONS_URL);
  page.once('dialog', (dialog) => dialog.accept());
  await auditionBox(page, title).getByText('Edit or delete').click();
  await auditionBox(page, title).getByRole('button', { name: 'Delete Audition' }).click();
  await expect(page.locator('.notification.is-success')).toContainText('Audition deleted.');
});
