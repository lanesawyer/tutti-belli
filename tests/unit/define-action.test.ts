import { describe, it, expect, vi, afterEach } from "vitest";
import { ActionError } from "astro:actions";
import { defineAction } from "@actions/define";
import { callAction } from "../support/actions.ts";

describe("defineAction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs an unexpected error with the request, then fails the action as Astro does", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("database is down");
    const action = defineAction({
      accept: "form",
      handler: () => {
        throw error;
      },
    });

    const result = await callAction(action, {});

    expect(log).toHaveBeenCalledWith("POST / failed:", error);
    expect(result.error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  });

  it("does not log an ActionError", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const action = defineAction({
      accept: "form",
      handler: () => {
        throw new ActionError({ code: "FORBIDDEN" });
      },
    });

    const result = await callAction(action, {});

    expect(log).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the handler's data", async () => {
    const action = defineAction({ accept: "form", handler: () => "ok" });
    expect((await callAction(action, {})).data).toBe("ok");
  });
});
