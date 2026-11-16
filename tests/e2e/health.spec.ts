import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("/health answers without a session when the database is up", async ({ request }) => {
  const response = await request.get("/health", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
