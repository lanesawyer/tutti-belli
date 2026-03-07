/**
 * E2E tests for the profile page updateInfo action.
 */
import { test, expect } from '@playwright/test';

test('updateParts rejects a membershipId that does not belong to the current user', async ({ page }) => {
  // Navigate first to pick up the session cookie
  await page.goto('/profile');

  const foreignMembershipId = crypto.randomUUID();

  const response = await page.evaluate(async (membershipId) => {
    const formData = new FormData();
    formData.append('membershipId', membershipId);
    const res = await fetch('/_actions/profile.updateParts', { method: 'POST', body: formData });
    return res.status;
  }, foreignMembershipId);

  expect(response).toBe(403);
});

test('user can update name and phone via the combined info form', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL('/profile');

  const nameInput = page.locator('input[name="name"]');
  const phoneInput = page.locator('input[name="phone"]');

  await nameInput.fill('Updated Name');
  await phoneInput.fill('555-123-4567');

  await page.click('button[type="submit"]');

  // On success the action redirects back to /profile
  await expect(page).toHaveURL('/profile');

  // The updated name should now be rendered on the page
  await expect(page.locator('input[name="name"]')).toHaveValue('Updated Name');
  await expect(page.locator('input[name="phone"]')).toHaveValue('555-123-4567');
});

test('invalid phone format shows an error notification', async ({ page }) => {
  await page.goto('/profile');

  // Bypass browser-native pattern validation by setting value directly
  await page.locator('input[name="phone"]').evaluate(
    (el: HTMLInputElement) => { el.value = '5551234567'; }
  );

  // Remove the pattern attribute so the browser doesn't block submission
  await page.locator('input[name="phone"]').evaluate(
    (el: HTMLInputElement) => { el.removeAttribute('pattern'); }
  );

  await page.click('button[type="submit"]');

  await expect(page.locator('.notification.is-danger')).toBeVisible();
});
