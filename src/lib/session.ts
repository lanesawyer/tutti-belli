import { db, eq, User } from 'astro:db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = import.meta.env.JWT_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-me';

export interface SessionPayload {
  userId: string;
}

export function createSession(userId: string): string {
  return jwt.sign({ userId } as SessionPayload, JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function getSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  
  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionPayload;
    return payload;
  } catch (error) {
    return null;
  }
}

export function deleteSession(token: string): void {
  // JWTs are stateless, so we just need to delete the cookie
  // The token will expire naturally or the cookie will be cleared
}

export async function getUserFromSession(token: string | undefined) {
  const session = getSession(token);
  if (!session) return null;

  const [user] = await db.select().from(User).where(eq(User.id, session.userId));
  return user || null;
}
