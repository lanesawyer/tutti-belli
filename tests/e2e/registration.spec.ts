/**
 * E2E tests for the registration and email verification flows.
 * These run WITHOUT storageState (anonymous browser context).
 */
import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

// Unique suffix per worker+run so registrations don't collide across parallel
// workers or repeated test runs against the same dev database.
function uniqueEmail(label: string, workerIndex: number): string {
  return `e2e-${label}-${workerIndex}-${Date.now()}@example.com`;
}

// ---------------------------------------------------------------------------
// Registration form
// ---------------------------------------------------------------------------

test('successful registration shows a "check your inbox" message', async ({ page }, workerInfo) => {
  const email = uniqueEmail('newuser', workerInfo.workerIndex);
  await page.goto('/register');
  await page.fill('input[name="name"]', 'New User');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-success')).toBeVisible();
  await expect(page.locator('.notification.is-success')).toContainText('Check your inbox');
  await expect(page.locator('.notification.is-success')).toContainText(email);
  // User is NOT logged in — still on the register page
  await expect(page).toHaveURL(/\/register/);
});

test('successful registration shows a resend link', async ({ page }, workerInfo) => {
  await page.goto('/register');
  await page.fill('input[name="name"]', 'Resend Test');
  await page.fill('input[name="email"]', uniqueEmail('resend', workerInfo.workerIndex));
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-success')).toBeVisible();
  const resendLink = page.locator('a[href*="/resend-verification"]');
  await expect(resendLink).toBeVisible();
});

test('registering a duplicate email shows an error', async ({ page }) => {
  await page.goto('/register');
  await page.fill('input[name="name"]', 'Duplicate');
  await page.fill('input[name="email"]', 'admin@example.com'); // seed user
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-danger')).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});

test('already-authenticated user visiting /register is redirected', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'test123');
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto('/register');
  await expect(page).not.toHaveURL(/\/register/);
});

// ---------------------------------------------------------------------------
// Login blocked for unverified users
// ---------------------------------------------------------------------------

test('unverified user cannot log in and sees a warning', async ({ page }, workerInfo) => {
  const email = uniqueEmail('unverified', workerInfo.workerIndex);

  // Register a fresh account (which starts unverified)
  await page.goto('/register');
  await page.fill('input[name="name"]', 'Unverified User');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page.locator('.notification.is-success')).toBeVisible();

  // Attempt to log in without verifying
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-warning')).toBeVisible();
  await expect(page.locator('.notification.is-warning')).toContainText('Email not verified');
  // Should remain on login, not be logged in
  await expect(page).toHaveURL(/\/login/);
});

test('unverified login warning includes a resend link', async ({ page }, workerInfo) => {
  const email = uniqueEmail('resend-login', workerInfo.workerIndex);

  await page.goto('/register');
  await page.fill('input[name="name"]', 'Resend From Login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  // Wait for the success notification before navigating away — Firefox aborts
  // page.goto() if called while ClientRouter is still mid-transition.
  await expect(page.locator('.notification.is-success')).toBeVisible({ timeout: 15000 });

  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  const resendLink = page.locator('a[href*="/resend-verification"]');
  await expect(resendLink).toBeVisible();
});

// ---------------------------------------------------------------------------
// Resend verification page
// ---------------------------------------------------------------------------

test('resend-verification page shows a success message after submission', async ({ page }) => {
  await page.goto('/resend-verification');
  await page.fill('input[name="email"]', 'anyone@example.com');
  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-success')).toBeVisible();
});

test('resend-verification pre-fills email from query param', async ({ page }) => {
  await page.goto('/resend-verification?email=prefilled%40example.com');
  await expect(page.locator('input[name="email"]')).toHaveValue('prefilled@example.com');
});

// ---------------------------------------------------------------------------
// verify-email page error states
// ---------------------------------------------------------------------------

test('/verify-email with no token shows an error', async ({ page }) => {
  await page.goto('/verify-email');
  await expect(page.locator('.notification.is-danger')).toBeVisible();
});

test('/verify-email with an invalid token shows an error', async ({ page }) => {
  await page.goto('/verify-email?token=not-a-real-token');
  await expect(page.locator('.notification.is-danger')).toBeVisible();
});

test('/verify-email error page links to resend', async ({ page }) => {
  await page.goto('/verify-email?token=not-a-real-token');
  const resendLink = page.locator('a[href*="/resend-verification"]');
  await expect(resendLink).toBeVisible();
});
