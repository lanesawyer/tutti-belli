import { db, eq, User } from 'astro:db';

export interface Session {
  userId: string;
  expiresAt: Date;
}

const sessions = new Map<string, Session>();

export function createSession(userId: string): string {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  sessions.set(sessionId, {
    userId,
    expiresAt,
  });

  return sessionId;
}

export function getSession(sessionId: string | undefined): Session | null {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export async function getUserFromSession(sessionId: string | undefined) {
  const session = getSession(sessionId);
  if (!session) return null;

  const [user] = await db.select().from(User).where(eq(User.id, session.userId));
  return user || null;
}
