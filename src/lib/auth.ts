import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, eq, User, PasswordResetToken } from "@db";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A bcrypt hash of a password nobody knows, at the same cost as `hashPassword`. Login checks it
 * when no account matches, so the response time doesn't say whether one does.
 */
export const DUMMY_PASSWORD_HASH = "$2b$10$UIH6QlSuqKle4wrISvwe2uvg4mZg2PkwBbTUH9I75AGLqpUs0Fuuy";

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

/** Why a password can't be set as a new password, or null if it can. */
export function newPasswordError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} characters.`;
  }
  return null;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(User).where(eq(User.email, email.trim().toLowerCase()));
  return user ?? null;
}

export const EMAIL_VERIFICATION_TTL_MS = 60 * 60 * 1000;

/** What the database stores for an emailed token, so a copy of the database holds no working links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(
  userId: string,
  ttlMs = 60 * 60 * 1000,
): Promise<string> {
  const { token, insert } = passwordResetTokenInsert(userId, ttlMs);
  await insert;
  return token;
}

/** The insert for a new reset token, unexecuted, so it can run inside a batch. */
export function passwordResetTokenInsert(userId: string, ttlMs = 60 * 60 * 1000) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);
  return {
    token,
    insert: db
      .insert(PasswordResetToken)
      .values({ id: crypto.randomUUID(), userId, token: hashToken(token), expiresAt }),
  };
}
