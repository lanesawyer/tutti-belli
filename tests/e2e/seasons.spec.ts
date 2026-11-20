/**
 * E2E tests for the seasons page.
 * Uses the admin user's auth state (chromium-admin project).
 *
 * These tests rely on seed data: the "Chamber Orchestra" ensemble, which has a season.
 */
import { test, expect } from "@playwright/test";

test("the season members dialog shows who is already in the season", async ({ page }) => {
  await page.goto("/ensembles");
  await page.locator(".card").filter({ hasText: "Chamber Orchestra" }).locator("a").first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  await page.goto(page.url() + "/seasons");

  const membersModal = page.locator("#members-modal");
  const firstMember = membersModal.locator(".member-checkbox").first();
  const openDialog = async () => {
    await page.locator(".manage-members-btn").first().click();
    await expect(membersModal).toHaveClass(/is-active/);
  };
  const toggleAndClose = async () => {
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("seasons.toggleMember")),
      firstMember.click(),
    ]);
    await Promise.all([page.waitForEvent("load"), page.locator("#close-members-btn").click()]);
  };

  await openDialog();
  const wasMember = await firstMember.locator("input").isChecked();
  await toggleAndClose();

  // The dialog used to open with every box empty, whatever the membership was.
  await openDialog();
  await expect(firstMember.locator("input")).toBeChecked({ checked: !wasMember });

  // Put the membership back as it was.
  await toggleAndClose();
  await openDialog();
  await expect(firstMember.locator("input")).toBeChecked({ checked: wasMember });
});
