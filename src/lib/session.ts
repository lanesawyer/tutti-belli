import { db, eq, User } from '@db';
import jwt from 'jsonwebtoken';

// No fallback: a default secret would let anyone forge a session for any user.
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export interface SessionPayload {
  userId: string;
}

export function createSession(userId: string): string {
  return jwt.sign({ userId } as SessionPayload, jwtSecret(), {
    expiresIn: '30d',
  });
}

export function getSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const secret = jwtSecret();

  try {
    const payload = jwt.verify(token, secret) as Partial<SessionPayload>;
    // Other tokens signed with the same secret (view-as) have no userId and aren't sessions.
    return typeof payload.userId === 'string' ? (payload as SessionPayload) : null;
  } catch {
    return null;
  }
}

interface ViewAsPayload {
  purpose: 'view-as';
  adminId: string;
  targetId: string;
}

/** A short-lived token that lets a site admin browse the site as another user. */
export function createViewAsToken(adminId: string, targetId: string): string {
  return jwt.sign({ purpose: 'view-as', adminId, targetId } satisfies ViewAsPayload, jwtSecret(), {
    expiresIn: '1h',
  });
}

export function readViewAsToken(token: string): { adminId: string; targetId: string } | null {
  try {
    const payload = jwt.verify(token, jwtSecret()) as Partial<ViewAsPayload>;
    if (payload.purpose !== 'view-as' || !payload.adminId || !payload.targetId) return null;
    return { adminId: payload.adminId, targetId: payload.targetId };
  } catch {
    return null;
  }
}

export function deleteSession(): void {
  // JWTs are stateless, so we just need to delete the cookie
  // The token will expire naturally or the cookie will be cleared
}

export async function getUserFromSession(token: string | undefined) {
  const session = getSession(token);
  if (!session) return null;

  const [user] = await db.select().from(User).where(eq(User.id, session.userId));
  return user || null;
}
