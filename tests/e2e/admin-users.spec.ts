/**
 * E2E tests for the site admin user list.
 * Runs as admin (chromium-admin project).
 */
import { test, expect } from "@playwright/test";

function uniqueEmail(label: string, workerIndex: number): string {
  return `e2e-${label}-${workerIndex}-${Date.now()}@example.com`;
}

test("deleting a user whose name contains quotes confirms with the exact name", async ({
  page,
  browser,
}, workerInfo) => {
  const name = `Pat O'Brien "</script><img src=x onerror=alert(1)>`;
  const email = uniqueEmail("quoted-name", workerInfo.workerIndex);

  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const anonPage = await anon.newPage();
  await anonPage.goto("/register");
  await anonPage.fill('input[name="name"]', name);
  await anonPage.fill('input[name="email"]', email);
  await anonPage.fill('input[name="password"]', "password123");
  await anonPage.click('main button[type="submit"]');
  await expect(anonPage.locator(".notification.is-success")).toBeVisible();
  await anon.close();

  await page.goto("/admin");
  const row = page.locator("tr").filter({ hasText: email });
  await expect(row.locator("td").first()).toHaveText(name);

  const messages: string[] = [];
  page.once("dialog", (dialog) => {
    messages.push(dialog.message());
    dialog.dismiss();
  });
  await row.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toBe(`Delete user "${name}"? This cannot be undone.`);
  await expect(page.locator("tr").filter({ hasText: email })).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("tr").filter({ hasText: email })).toHaveCount(0);
});
