import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const batches: unknown[][] = [];
let failOnCall = 0;
vi.mock("resend", () => ({
  Resend: class {
    batch = {
      send: async (paramsList: unknown[]) => {
        batches.push(paramsList);
        if (batches.length === failOnCall) return { error: { message: "rate limited" } };
        return { error: null };
      },
    };
  },
}));

import { sendAnnouncementEmail } from "../../src/lib/email.ts";

const recipients = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ email: `m${i}@example.com`, name: `M${i}` }));

const send = (count: number) =>
  sendAnnouncementEmail(recipients(count), "Choir", "choir", "Title", "Body", "Author");

describe("announcement batch sending", () => {
  beforeEach(() => {
    batches.length = 0;
    failOnCall = 0;
    vi.stubEnv("EMAIL_DISABLED", "");
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "noreply@tuttibelli.org");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends 100 recipients in one call", async () => {
    expect(await send(100)).toEqual({ success: true });
    expect(batches.map((b) => b.length)).toEqual([100]);
  });

  it("splits more than 100 recipients into chunks of at most 100", async () => {
    expect(await send(250)).toEqual({ success: true });
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it("stops and fails when a chunk fails", async () => {
    failOnCall = 2;
    expect(await send(250)).toEqual({ success: false, error: "rate limited" });
    expect(batches).toHaveLength(2);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("100 of 250 sent"),
      expect.anything(),
    );
  });
});
