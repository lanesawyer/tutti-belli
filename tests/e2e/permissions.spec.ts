/**
 * E2E tests for authorization and permission boundaries.
 * Uses the regular user's auth state (test@example.com).
 */
import { test, expect } from '@playwright/test';

// Use the regular user's stored auth state for this spec file
test.use({ storageState: 'tests/e2e/.auth/user.json' });

test('regular user accessing /admin is redirected away', async ({ page }) => {
  await page.goto('/admin');
  // Admin page redirects non-admins to /
  await expect(page).not.toHaveURL('/admin');
});

test('regular user does not see admin panel link in navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="/admin"]')).not.toBeVisible();
});

test('unauthenticated access to a protected API route redirects to login', async ({ page }) => {
  // Use a new context without any auth cookies
  await page.context().clearCookies();
  await page.goto('/ensembles');
  await expect(page).toHaveURL(/\/login/);
});
