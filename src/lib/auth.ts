import bcrypt from 'bcryptjs';
import { db, eq, User, PasswordResetToken } from '@db';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken(): string {
  return crypto.randomUUID();
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(User).where(eq(User.email, email));
  return user ?? null;
}

export async function createPasswordResetToken(userId: string, ttlMs = 60 * 60 * 1000): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(PasswordResetToken).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt,
  });
  return token;
}
