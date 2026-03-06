/**
 * Test data factory helpers for integration tests.
 * Each function inserts a row and returns the created record.
 */
import { db, User, Ensemble, EnsembleMember, EnsembleInvite, MemberPart, Season, Event, Part, Song, SeasonSong, SongFile, EventProgram, Task, TaskCompletion, Group, GroupMembership, eq } from 'astro:db';
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

export async function createInvite(
  ensembleId: string,
  createdBy: string,
  overrides: { id?: string; code?: string; expiresAt?: Date } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(EnsembleInvite).values({
    id,
    ensembleId,
    createdBy,
    code: overrides.code ?? `INV${id.slice(0, 5).toUpperCase()}`,
    expiresAt: overrides.expiresAt,
  });
  return db.select().from(EnsembleInvite).where(eq(EnsembleInvite.id, id)).get() as Promise<typeof EnsembleInvite.$inferSelect>;
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
    groupId?: string;
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
    groupId: overrides.groupId,
  });
  return db.select().from(Event).where(eq(Event.id, id)).get() as Promise<typeof Event.$inferSelect>;
}

export async function createGroup(
  ensembleId: string,
  overrides: { id?: string; name?: string; color?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(Group).values({
    id,
    ensembleId,
    name: overrides.name ?? 'Test Group',
    color: overrides.color ?? 'info',
  });
  return db.select().from(Group).where(eq(Group.id, id)).get() as Promise<typeof Group.$inferSelect>;
}

export async function createGroupMembership(
  groupId: string,
  userId: string,
  overrides: { id?: string; role?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(GroupMembership).values({ id, groupId, userId, role: overrides.role });
  return db.select().from(GroupMembership).where(eq(GroupMembership.id, id)).get() as Promise<typeof GroupMembership.$inferSelect>;
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

export async function createSongFile(
  songId: string,
  uploadedBy: string,
  overrides: {
    name?: string;
    url?: string;
    category?: 'link' | 'sheet_music' | 'rehearsal_track' | 'other';
  } = {}
) {
  const id = crypto.randomUUID();
  await db.insert(SongFile).values({
    id,
    songId,
    uploadedBy,
    name: overrides.name ?? 'Test File',
    url: overrides.url ?? 'https://storage.example.com/test.pdf',
    category: overrides.category ?? 'sheet_music',
  });
  return db.select().from(SongFile).where(eq(SongFile.id, id)).get() as Promise<typeof SongFile.$inferSelect>;
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
  overrides: { id?: string; sortOrder?: number; practiceMinutes?: number; notes?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(EventProgram).values({
    id,
    eventId,
    songId,
    sortOrder: overrides.sortOrder ?? 1,
    practiceMinutes: overrides.practiceMinutes,
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

export async function createMemberPart(
  membershipId: string,
  partId: string,
  overrides: { id?: string } = {}
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(MemberPart).values({ id, membershipId, partId });
  return db.select().from(MemberPart).where(eq(MemberPart.id, id)).get() as Promise<typeof MemberPart.$inferSelect>;
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
