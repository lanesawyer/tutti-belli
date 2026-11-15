import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { db, eq, User } from "@db";
import { createSession, createViewAsToken, revokeSessions } from "@lib/session";
import { VIEW_AS_COOKIE } from "@lib/view-as";
import { onRequest } from "../../src/middleware.ts";
import { createTestContext } from "../support/actions.ts";
import { createUser } from "./fixtures.ts";

async function run(path: string, cookies: Record<string, string> = {}) {
  const context = createTestContext({ path, cookies });
  const next = vi.fn(async () => new Response("page"));
  const response = (await onRequest(context, next)) as Response;
  return { context, next, response, locals: context.locals };
}

function expectLoginRedirect(result: Awaited<ReturnType<typeof run>>, redirect: string) {
  expect(result.next).not.toHaveBeenCalled();
  expect(result.response.status).toBe(302);
  expect(result.response.headers.get("location")).toBe(
    `/login?redirect=${encodeURIComponent(redirect)}`,
  );
}

describe("public routes", () => {
  it.each([
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/invite/join",
    "/invite/join/TEST1234",
    "/verify-email",
    "/verify-email-change",
    "/resend-verification",
    "/health",
    "/login/",
  ])("serves %s without a session", async (path) => {
    const result = await run(path);
    expect(result.next).toHaveBeenCalledOnce();
    expect(await result.response.text()).toBe("page");
    expect(result.locals).toMatchObject({ user: null, session: null, viewingAs: null });
  });

  it("serves a public route to a visitor with a bad session, as signed out", async () => {
    const result = await run("/login", { session: "garbage" });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.locals.user).toBeNull();
  });
});

describe("protected routes", () => {
  it.each([
    "/ensembles",
    "/profile",
    "/admin",
    "/ensembles/abc/events/def",
    "/checkin/ABC123",
    "/api/files/1",
  ])("redirects %s to the login page", async (path) => {
    expectLoginRedirect(await run(path), path);
  });

  it.each(["/loginx", "/registered", "/invite", "/invite/joined", "/reset-password-admin"])(
    "does not treat %s as public because it starts like a public route",
    async (path) => {
      expectLoginRedirect(await run(path), path);
    },
  );

  it("carries only the path into the redirect", async () => {
    const result = await run("/ensembles/abc?tab=members");
    expectLoginRedirect(result, "/ensembles/abc");
  });
});

describe("errors", () => {
  it("logs an error thrown while handling the request with its method and path", async () => {
    const error = new Error("boom");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const context = createTestContext({ path: "/login", method: "POST" });
    await expect(onRequest(context, async () => Promise.reject(error))).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith("POST /login failed:", error);
    log.mockRestore();
  });
});

describe("sessions", () => {
  it("populates locals.user and locals.session from a valid session", async () => {
    const user = await createUser({ name: "Signed In" });
    const result = await run("/ensembles", {
      session: createSession(user.id, user.sessionVersion),
    });

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.locals.user).toMatchObject({ id: user.id, name: "Signed In" });
    expect(result.locals.session).toMatchObject({ userId: user.id, sessionVersion: 0 });
    expect(result.locals.viewingAs).toBeNull();
  });

  it("rejects a token that is not a JWT", async () => {
    const result = await run("/ensembles", { session: "not-a-token" });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals).toMatchObject({ user: null, session: null });
  });

  it("rejects a token signed with another secret", async () => {
    const user = await createUser();
    const forged = jwt.sign({ userId: user.id, sessionVersion: 0 }, "some-other-secret");
    const result = await run("/ensembles", { session: forged });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals.user).toBeNull();
  });

  it("rejects an unsigned token", async () => {
    const user = await createUser();
    const unsigned = jwt.sign({ userId: user.id, sessionVersion: 0 }, "", { algorithm: "none" });
    const result = await run("/ensembles", { session: unsigned });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals.user).toBeNull();
  });

  it("rejects an expired session", async () => {
    const user = await createUser();
    const expired = jwt.sign({ userId: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, {
      expiresIn: -60,
    });
    const result = await run("/ensembles", { session: expired });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals).toMatchObject({ user: null, session: null });
  });

  it("rejects a session that was revoked", async () => {
    const user = await createUser();
    const token = createSession(user.id, user.sessionVersion);
    await revokeSessions(user.id);

    const result = await run("/ensembles", { session: token });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals).toMatchObject({ user: null, session: null });
  });

  it("rejects a session whose user no longer exists", async () => {
    const user = await createUser();
    const token = createSession(user.id, user.sessionVersion);
    await db.delete(User).where(eq(User.id, user.id));

    const result = await run("/ensembles", { session: token });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals.user).toBeNull();
  });

  it("does not accept a view-as token as a session", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    const result = await run("/ensembles", { session: createViewAsToken(admin.id, target.id) });
    expectLoginRedirect(result, "/ensembles");
    expect(result.locals.user).toBeNull();
  });
});

describe("view as", () => {
  it("serves the request as the viewed user for a site admin", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ name: "Viewed" });
    const result = await run("/ensembles", {
      session: createSession(admin.id, admin.sessionVersion),
      [VIEW_AS_COOKIE]: createViewAsToken(admin.id, target.id),
    });

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.locals.user?.id).toBe(target.id);
    expect(result.locals.viewingAs?.realUser.id).toBe(admin.id);
  });

  it("ignores and clears a view-as cookie held by someone who is not a site admin", async () => {
    const admin = await createUser({ role: "admin" });
    const user = await createUser();
    const target = await createUser();
    const result = await run("/ensembles", {
      session: createSession(user.id, user.sessionVersion),
      [VIEW_AS_COOKIE]: createViewAsToken(admin.id, target.id),
    });

    expect(result.locals.user?.id).toBe(user.id);
    expect(result.locals.viewingAs).toBeNull();
    expect(result.context.cookies.has(VIEW_AS_COOKIE)).toBe(false);
  });

  it("never lets a site admin view as another site admin", async () => {
    const admin = await createUser({ role: "admin" });
    const otherAdmin = await createUser({ role: "admin" });
    const result = await run("/ensembles", {
      session: createSession(admin.id, admin.sessionVersion),
      [VIEW_AS_COOKIE]: createViewAsToken(admin.id, otherAdmin.id),
    });

    expect(result.locals.user?.id).toBe(admin.id);
    expect(result.locals.viewingAs).toBeNull();
  });

  it("does not sign anyone in from a view-as cookie alone", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();
    const result = await run("/ensembles", {
      [VIEW_AS_COOKIE]: createViewAsToken(admin.id, target.id),
    });

    expectLoginRedirect(result, "/ensembles");
    expect(result.locals.user).toBeNull();
    expect(result.context.cookies.has(VIEW_AS_COOKIE)).toBe(false);
  });
});
