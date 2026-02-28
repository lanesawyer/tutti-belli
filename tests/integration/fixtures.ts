/**
 * Test data factory helpers for integration tests.
 * Each function inserts a row and returns the created record.
 */
import { db, User, Ensemble, EnsembleMember, Season, Event, Part, Song, SeasonSong, EventProgram, Task, TaskCompletion, eq } from 'astro:db';
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

export async function createSong(
  ensembleId: string,
  overrides: { id?: string; name?: string; composer?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Song).values({
    id,
    ensembleId,
    name: overrides.name ?? 'Test Song',
    composer: overrides.composer,
  });
  return db.select().from(Song).where(eq(Song.id, id)).get() as Promise<typeof Song.$inferSelect>;
}

export async function createSeasonSong(
  seasonId: string,
  songId: string,
  overrides: { id?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(SeasonSong).values({ id, seasonId, songId });
  return db.select().from(SeasonSong).where(eq(SeasonSong.id, id)).get() as Promise<typeof SeasonSong.$inferSelect>;
}

export async function createEventProgramEntry(
  eventId: string,
  songId: string,
  overrides: { id?: string; sortOrder?: number; notes?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(EventProgram).values({
    id,
    eventId,
    songId,
    sortOrder: overrides.sortOrder ?? 1,
    notes: overrides.notes,
  });
  return db.select().from(EventProgram).where(eq(EventProgram.id, id)).get() as Promise<typeof EventProgram.$inferSelect>;
}

export async function createTask(
  ensembleId: string,
  overrides: { id?: string; title?: string; description?: string; sortOrder?: number; seasonId?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Task).values({
    id,
    ensembleId,
    seasonId: overrides.seasonId,
    title: overrides.title ?? 'Test Task',
    description: overrides.description,
    sortOrder: overrides.sortOrder ?? 0,
  });
  return db.select().from(Task).where(eq(Task.id, id)).get() as Promise<typeof Task.$inferSelect>;
}

export async function createTaskCompletion(
  taskId: string,
  userId: string,
  completedBy: string,
  overrides: { id?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(TaskCompletion).values({ id, taskId, userId, completedBy });
  return db.select().from(TaskCompletion).where(eq(TaskCompletion.id, id)).get() as Promise<typeof TaskCompletion.$inferSelect>;
}
