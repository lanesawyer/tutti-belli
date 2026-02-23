/**
 * E2E tests for authentication flows.
 * These run WITHOUT storageState (anonymous browser context).
 */
import { test, expect } from '@playwright/test';

// Override the storageState set in playwright.config.ts for this file
test.use({ storageState: { cookies: [], origins: [] } });

test('login with valid credentials redirects away from /login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);
});

test('login with invalid password shows an error notification', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-danger')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('login with unknown email shows an error notification', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'nobody@unknown.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-danger')).toBeVisible();
});

test('unauthenticated access to /ensembles redirects to /login', async ({ page }) => {
  await page.goto('/ensembles');
  await expect(page).toHaveURL(/\/login/);
});

test('redirect param is appended to the login URL when accessing a protected page', async ({ page }) => {
  await page.goto('/ensembles');
  await expect(page).toHaveURL(/redirect=/);
});

test('already-authenticated user going to /login is redirected', async ({ page }) => {
  // Log in first
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);

  // Trying to visit /login again should redirect away
  await page.goto('/login');
  await expect(page).not.toHaveURL(/\/login/);
});
