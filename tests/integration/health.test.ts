import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@db";
import { databaseIsUp } from "@lib/health";

describe("databaseIsUp", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is true when the database answers", async () => {
    expect(await databaseIsUp()).toBe(true);
  });

  it("is false, and logs why, when the query fails", async () => {
    const error = new Error("connection refused");
    vi.spyOn(db, "run").mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await databaseIsUp()).toBe(false);
    expect(log).toHaveBeenCalledWith("Health check: database query failed", error);
  });
});
