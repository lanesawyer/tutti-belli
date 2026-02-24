/**
 * Test data factory helpers for integration tests.
 * Each function inserts a row and returns the created record.
 */
import { db, User, Ensemble, EnsembleMember, Season, Event, Part, eq } from 'astro:db';
import { hashPassword } from '../../src/lib/auth.ts';

export async function createUser(overrides: {
  id?: string;
  email?: string;
  name?: string;
  password?: string;
  role?: 'admin' | 'user';
} = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const passwordHash = await hashPassword(overrides.password ?? 'test123');
  await db.insert(User).values({
    id,
    email: overrides.email ?? `user-${id.slice(0, 8)}@test.com`,
    passwordHash,
    name: overrides.name ?? 'Test User',
    role: overrides.role ?? 'user',
  });
  return db.select().from(User).where(eq(User.id, id)).get() as Promise<typeof User.$inferSelect>;
}

export async function createEnsemble(
  createdBy: string,
  overrides: {
    id?: string;
    name?: string;
    slug?: string;
    checkInStartMinutes?: number;
    checkInEndMinutes?: number;
  } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Ensemble).values({
    id,
    name: overrides.name ?? 'Test Ensemble',
    slug: overrides.slug,
    checkInStartMinutes: overrides.checkInStartMinutes ?? 30,
    checkInEndMinutes: overrides.checkInEndMinutes ?? 15,
    createdBy,
  });
  return db.select().from(Ensemble).where(eq(Ensemble.id, id)).get() as Promise<typeof Ensemble.$inferSelect>;
}

export async function createMembership(
  ensembleId: string,
  userId: string,
  overrides: { role?: 'admin' | 'member'; status?: 'active' | 'pending' } = {}
) {
  const id = crypto.randomUUID();
  await db.insert(EnsembleMember).values({
    id,
    ensembleId,
    userId,
    role: overrides.role ?? 'member',
    status: overrides.status ?? 'active',
  });
  return db.select().from(EnsembleMember).where(eq(EnsembleMember.id, id)).get() as Promise<typeof EnsembleMember.$inferSelect>;
}

export async function createSeason(
  ensembleId: string,
  overrides: { id?: string; name?: string; isActive?: number } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Season).values({
    id,
    ensembleId,
    name: overrides.name ?? 'Test Season',
    isActive: overrides.isActive ?? 1,
  });
  return db.select().from(Season).where(eq(Season.id, id)).get() as Promise<typeof Season.$inferSelect>;
}

export async function createPart(
  ensembleId: string,
  overrides: { id?: string; name?: string; sortOrder?: number } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Part).values({
    id,
    ensembleId,
    name: overrides.name ?? 'Soprano',
    sortOrder: overrides.sortOrder ?? 0,
  });
  return db.select().from(Part).where(eq(Part.id, id)).get() as Promise<typeof Part.$inferSelect>;
}

export async function createEvent(
  ensembleId: string,
  seasonId: string,
  overrides: {
    id?: string;
    title?: string;
    scheduledAt?: Date;
    checkInCode?: string;
    category?: 'rehearsal' | 'performance';
    durationMinutes?: number;
  } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Event).values({
    id,
    ensembleId,
    seasonId,
    title: overrides.title ?? 'Test Rehearsal',
    category: overrides.category ?? 'rehearsal',
    scheduledAt: overrides.scheduledAt ?? new Date(),
    durationMinutes: overrides.durationMinutes ?? 90,
    checkInCode: overrides.checkInCode ?? `CODE${id.slice(0, 6).toUpperCase()}`,
  });
  return db.select().from(Event).where(eq(Event.id, id)).get() as Promise<typeof Event.$inferSelect>;
}
