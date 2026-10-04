/**
 * E2E tests for signing out of other devices from the profile page.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';

// Signing out revokes every session the account has, so this uses a seeded account no other
// spec signs in as, and runs in one browser so two projects don't revoke each other mid-test.
test.skip(({ browserName }) => browserName !== 'chromium', 'Revokes a shared seeded account');

const EMAIL = 'ensadmin@example.com';
const PASSWORD = 'ensadmin123';

async function signIn(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test('signing out of other devices keeps this browser signed in', async ({ browser }) => {
  const thisDevice = await signIn(browser);
  const otherDevice = await signIn(browser);

  await thisDevice.goto('/profile');
  await thisDevice.getByRole('button', { name: 'Sign Out of Other Devices' }).click();
  await expect(thisDevice).toHaveURL('/profile?signedOutOthers=1');
  await expect(thisDevice.locator('.notification.is-success')).toContainText('signed out on every other device');

  await otherDevice.goto('/profile');
  await expect(otherDevice).toHaveURL(/\/login/);

  await thisDevice.goto('/profile');
  await expect(thisDevice).toHaveURL('/profile');
});

test('an admin viewing as another user cannot sign that user out of other devices', async ({ page }) => {
  await page.goto('/admin');
  await page.locator('tr', { hasText: EMAIL }).getByRole('button', { name: 'View as' }).click();
  await expect(page).not.toHaveURL(/\/admin/);

  const status = await page.evaluate(async () => {
    const res = await fetch('/_actions/profile.signOutOtherDevices', { method: 'POST', body: new FormData() });
    return res.status;
  });
  expect(status).toBe(403);

  await page.request.post('/view-as/exit');
});
