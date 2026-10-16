import { db, eq, and, asc, desc, inArray, Audition, AuditionSignup, Song, User } from '@db';
import { getEnsembleTimezone } from './events';
import { zonedTimeToInstant } from './timezone';

type AuditionRow = typeof Audition.$inferSelect;

/** Open for signups: not closed by an admin and the deadline (if any) hasn't passed. */
export function isAcceptingSignups(audition: Pick<AuditionRow, 'status' | 'signupDeadline'>, now = new Date()): boolean {
  return audition.status === 'open' && (!audition.signupDeadline || audition.signupDeadline > now);
}

export interface AuditionSignupView {
  id: string;
  userId: string;
  name: string;
  note: string | null;
  selected: boolean;
}

export interface AuditionView extends AuditionRow {
  songName: string | null;
  acceptingSignups: boolean;
  signupCount: number;
  mySignup: AuditionSignupView | null;
  /** Every signup for admins; for members, only the selected ones once the audition is closed. */
  signups: AuditionSignupView[];
}

/**
 * Auditions in an ensemble, newest first, optionally only those for one song. Members don't see
 * who else signed up, only the results after an admin closes the audition.
 */
export async function getAuditions(params: {
  ensembleId: string;
  userId: string;
  isAdmin: boolean;
  songId?: string;
}): Promise<AuditionView[]> {
  const { ensembleId, userId, isAdmin, songId } = params;
  const rows = await db
    .select({ audition: Audition, songName: Song.name })
    .from(Audition)
    .leftJoin(Song, eq(Audition.songId, Song.id))
    .where(songId ? and(eq(Audition.ensembleId, ensembleId), eq(Audition.songId, songId)) : eq(Audition.ensembleId, ensembleId))
    .orderBy(desc(Audition.createdAt))
    .all();
  if (rows.length === 0) return [];

  const signups = await db
    .select({
      id: AuditionSignup.id,
      auditionId: AuditionSignup.auditionId,
      userId: AuditionSignup.userId,
      name: User.name,
      note: AuditionSignup.note,
      selected: AuditionSignup.selected,
    })
    .from(AuditionSignup)
    .innerJoin(User, eq(AuditionSignup.userId, User.id))
    .where(inArray(AuditionSignup.auditionId, rows.map((r) => r.audition.id)))
    .orderBy(asc(AuditionSignup.createdAt), asc(User.name))
    .all();

  const now = new Date();
  return rows.map(({ audition, songName }) => {
    const forAudition = signups.filter((s) => s.auditionId === audition.id).map(({ auditionId: _, ...s }) => s);
    const visible = isAdmin ? forAudition : audition.status === 'closed' ? forAudition.filter((s) => s.selected) : [];
    return {
      ...audition,
      songName,
      acceptingSignups: isAcceptingSignups(audition, now),
      signupCount: forAudition.length,
      mySignup: forAudition.find((s) => s.userId === userId) ?? null,
      signups: visible,
    };
  });
}

export interface AuditionInput {
  title: string;
  description?: string;
  songId?: string;
  deadlineDate?: string;
  deadlineTime?: string;
}

async function toColumns(ensembleId: string, input: AuditionInput) {
  const signupDeadline = input.deadlineDate
    ? zonedTimeToInstant(input.deadlineDate, input.deadlineTime || '23:59', await getEnsembleTimezone(ensembleId))
    : null;
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    songId: input.songId || null,
    signupDeadline,
  };
}

export async function createAudition(ensembleId: string, input: AuditionInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(Audition).values({ id, ensembleId, ...(await toColumns(ensembleId, input)) });
  return id;
}

export async function editAudition(auditionId: string, ensembleId: string, input: AuditionInput): Promise<void> {
  await db.update(Audition).set(await toColumns(ensembleId, input)).where(eq(Audition.id, auditionId));
}

export async function setAuditionStatus(auditionId: string, status: 'open' | 'closed'): Promise<void> {
  await db.update(Audition).set({ status }).where(eq(Audition.id, auditionId));
}

export async function deleteAudition(auditionId: string): Promise<void> {
  await db.delete(AuditionSignup).where(eq(AuditionSignup.auditionId, auditionId));
  await db.delete(Audition).where(eq(Audition.id, auditionId));
}

/** Signs the user up, or updates their note if they already are. */
export async function signUpForAudition(
  auditionId: string,
  userId: string,
  note: string | undefined,
): Promise<{ type: 'success' } | { type: 'error'; message: string }> {
  const audition = await db.select().from(Audition).where(eq(Audition.id, auditionId)).get();
  if (!audition || !isAcceptingSignups(audition)) {
    return { type: 'error', message: 'Signups for this audition are closed.' };
  }
  await db
    .insert(AuditionSignup)
    .values({ id: crypto.randomUUID(), auditionId, userId, note: note?.trim() || null })
    .onConflictDoUpdate({
      target: [AuditionSignup.auditionId, AuditionSignup.userId],
      set: { note: note?.trim() || null },
    });
  return { type: 'success' };
}

export async function withdrawFromAudition(
  auditionId: string,
  userId: string,
): Promise<{ type: 'success' } | { type: 'error'; message: string }> {
  const audition = await db.select({ status: Audition.status }).from(Audition).where(eq(Audition.id, auditionId)).get();
  if (!audition || audition.status === 'closed') {
    return { type: 'error', message: 'This audition is closed. Ask an ensemble admin to remove you.' };
  }
  await db.delete(AuditionSignup).where(and(eq(AuditionSignup.auditionId, auditionId), eq(AuditionSignup.userId, userId)));
  return { type: 'success' };
}

export async function setSignupSelected(signupId: string, selected: boolean): Promise<void> {
  await db.update(AuditionSignup).set({ selected }).where(eq(AuditionSignup.id, signupId));
}

export async function removeSignup(signupId: string): Promise<void> {
  await db.delete(AuditionSignup).where(eq(AuditionSignup.id, signupId));
}

export async function getAuditionSongOptions(ensembleId: string) {
  return db.select({ id: Song.id, name: Song.name }).from(Song).where(eq(Song.ensembleId, ensembleId)).orderBy(asc(Song.name)).all();
}
