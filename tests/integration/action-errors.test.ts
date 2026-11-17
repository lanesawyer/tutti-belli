import { describe, expect, it } from "vitest";
import { isActionError } from "astro:actions";
import { throwUserError } from "@actions/utils";
import { UserError } from "@lib/errors";

function thrownBy(error: unknown): unknown {
  try {
    throwUserError("FORBIDDEN", error);
  } catch (thrown) {
    return thrown;
  }
}

describe("throwUserError", () => {
  it("reports a UserError to the user with the given code", () => {
    const thrown = thrownBy(new UserError("Check-in is closed."));
    expect(isActionError(thrown)).toBe(true);
    expect(thrown).toMatchObject({ code: "FORBIDDEN", message: "Check-in is closed." });
  });

  it("rethrows anything else unchanged, so it is logged as a server error", () => {
    const failure = new Error("SQLITE_BUSY: database is locked");
    expect(thrownBy(failure)).toBe(failure);
  });
});
