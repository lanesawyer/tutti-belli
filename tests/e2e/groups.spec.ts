/**
 * E2E tests for the groups page.
 * Uses the admin user's auth state (chromium-admin project).
 *
 * These tests rely on seed data: the "Chamber Orchestra" ensemble where
 * admin@example.com is an ensemble admin.
 */
import { test, expect, type Page } from "@playwright/test";

async function getEnsembleUrl(page: Page) {
  await page.goto("/ensembles");
  await page.locator(".card").filter({ hasText: "Chamber Orchestra" }).locator("a").first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  return page.url();
}

// Regression: the page script used to be an is:inline define:vars script. When the membership
// data changed, ClientRouter ran its new text on the next visit and added a second
// astro:page-load listener, so one checkbox change sent the toggle request twice.
test("member toggle sends one request after membership data changes", async ({ page }) => {
  const ensembleUrl = await getEnsembleUrl(page);
  await page.goto(ensembleUrl + "/groups");

  const groupName = `Listener Group ${Date.now()}`;
  await page.getByRole("button", { name: "Create Group" }).click();
  await page.fill('#createForm input[name="name"]', groupName);
  await page.locator('button[type="submit"][form="createForm"]').click();
  await expect(page.locator(".notification.is-success")).toBeVisible();

  let toggleRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("groups.toggleMember")) {
      toggleRequests++;
    }
  });

  const membersModal = page.locator("#members-modal");
  const firstMember = membersModal.locator(".member-checkbox").first();
  const groupRow = page.locator("tr", { hasText: groupName });

  await groupRow.locator(".manage-members-btn").click();
  await expect(membersModal).toHaveClass(/is-active/);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("groups.toggleMember")),
    firstMember.click(),
  ]);
  await membersModal.locator("button.delete").click();
  await expect(membersModal).not.toHaveClass(/is-active/);

  // Leave and come back through ClientRouter so the page renders the changed membership data.
  await page.locator(".breadcrumb a", { hasText: "Chamber Orchestra" }).click();
  await expect(page).not.toHaveURL(/\/groups$/);
  await page.locator("a.admin-tool-btn", { hasText: "Groups" }).click();
  await expect(page).toHaveURL(/\/groups$/);

  await groupRow.locator(".manage-members-btn").click();
  await expect(membersModal).toHaveClass(/is-active/);
  await expect(firstMember.locator("input")).toBeChecked();

  toggleRequests = 0;
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("groups.toggleMember")),
    firstMember.click(),
  ]);
  expect(toggleRequests).toBe(1);
});
