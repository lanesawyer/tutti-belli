import type { AstroCookies } from "astro";
import { db, eq, sql, User } from "@db";
import jwt from "jsonwebtoken";
import { EMAIL_VERIFICATION_TTL_MS } from "./auth";

// No fallback: a default secret would let anyone forge a session for any user.
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export interface SessionPayload {
  userId: string;
  sessionVersion: number;
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function createSession(userId: string, sessionVersion: number): string {
  return jwt.sign({ userId, sessionVersion } satisfies SessionPayload, jwtSecret(), {
    expiresIn: SESSION_MAX_AGE,
  });
}

/** Signs the user in on this browser with a session at their current version. */
export function startSession(
  cookies: AstroCookies,
  user: { id: string; sessionVersion: number },
): void {
  cookies.set("session", createSession(user.id, user.sessionVersion), {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Set alongside other User columns to invalidate every session the user has, on every device. */
export const bumpSessionVersion = sql`${User.sessionVersion} + 1`;

/** Invalidates every session the user has and returns the new version. */
export async function revokeSessions(userId: string): Promise<number | null> {
  const user = await db
    .update(User)
    .set({ sessionVersion: bumpSessionVersion })
    .where(eq(User.id, userId))
    .returning({ sessionVersion: User.sessionVersion })
    .get();
  return user?.sessionVersion ?? null;
}

export function getSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const secret = jwtSecret();

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as Partial<SessionPayload>;
    // Other tokens signed with the same secret (view-as) have no userId and aren't sessions.
    return typeof payload.userId === "string" && typeof payload.sessionVersion === "number"
      ? (payload as SessionPayload)
      : null;
  } catch {
    return null;
  }
}

interface ViewAsPayload {
  purpose: "view-as";
  adminId: string;
  targetId: string;
}

/** A short-lived token that lets a site admin browse the site as another user. */
export function createViewAsToken(adminId: string, targetId: string): string {
  return jwt.sign({ purpose: "view-as", adminId, targetId } satisfies ViewAsPayload, jwtSecret(), {
    expiresIn: "1h",
  });
}

export function readViewAsToken(token: string): { adminId: string; targetId: string } | null {
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"],
    }) as Partial<ViewAsPayload>;
    if (payload.purpose !== "view-as" || !payload.adminId || !payload.targetId) return null;
    return { adminId: payload.adminId, targetId: payload.targetId };
  } catch {
    return null;
  }
}

export const VERIFY_EMAIL_COOKIE = "verify_email";

interface VerifyEmailPayload {
  purpose: "verify-email";
  email: string;
}

/**
 * Marks this browser as the one that asked to verify `email`: the emailed link only signs in
 * here. It names the address as typed, not an account, so it is set the same way whether or not
 * the address has one.
 */
export function rememberVerifyingBrowser(cookies: AstroCookies, email: string): void {
  const maxAge = EMAIL_VERIFICATION_TTL_MS / 1000;
  const payload: VerifyEmailPayload = {
    purpose: "verify-email",
    email: email.trim().toLowerCase(),
  };
  cookies.set(VERIFY_EMAIL_COOKIE, jwt.sign(payload, jwtSecret(), { expiresIn: maxAge }), {
    path: "/",
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    maxAge,
  });
}

/** The address this browser asked to verify, if its cookie is valid. */
export function readVerifyingBrowser(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret(), {
      algorithms: ["HS256"],
    }) as Partial<VerifyEmailPayload>;
    return payload.purpose === "verify-email" && payload.email ? payload.email : null;
  } catch {
    return null;
  }
}

/** The user a verified session belongs to, or null if it was revoked. */
export async function getSessionUser(session: SessionPayload | null) {
  if (!session) return null;

  const [user] = await db.select().from(User).where(eq(User.id, session.userId));
  if (!user || session.sessionVersion !== user.sessionVersion) return null;
  return user;
}
