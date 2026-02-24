/**
 * Playwright setup project — logs in as both test users and saves auth state.
 * These JSON files are loaded by the chromium-admin and chromium-user projects
 * so tests don't need to log in on every spec file.
 */
import { test as setup, expect } from '@playwright/test';

const ADMIN_AUTH_FILE = 'tests/e2e/.auth/admin.json';
const USER_AUTH_FILE = 'tests/e2e/.auth/user.json';

setup('authenticate as site admin', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'admin@example.com');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  // After successful login, the redirect should move us away from /login
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: ADMIN_AUTH_FILE });
});

setup('authenticate as regular user', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().storageState({ path: USER_AUTH_FILE });
});
