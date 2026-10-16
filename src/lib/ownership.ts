import {
  db,
  eq,
  and,
  inArray,
  Announcement,
  Attendance,
  Audition,
  AuditionSignup,
  EnsembleInvite,
  EnsembleLink,
  EnsembleMember,
  Event,
  EventProgram,
  Group,
  Part,
  Season,
  Song,
  SongFile,
  Task,
} from '@db';

export type OwnedKind =
  | 'announcement'
  | 'attendance'
  | 'audition'
  | 'auditionSignup'
  | 'event'
  | 'group'
  | 'invite'
  | 'link'
  | 'membership'
  | 'part'
  | 'programEntry'
  | 'season'
  | 'song'
  | 'songFile'
  | 'task';

/**
 * The ensemble a record belongs to, or null if it doesn't exist. Actions take the target's ID
 * and the ensemble ID from the form separately, so they must check the two match before acting.
 */
export async function getOwningEnsembleId(kind: OwnedKind, id: string): Promise<string | null> {
  const row = await ownerQuery(kind, id);
  return row?.ensembleId ?? null;
}

function ownerQuery(kind: OwnedKind, id: string) {
  switch (kind) {
    case 'announcement':
      return db.select({ ensembleId: Announcement.ensembleId }).from(Announcement).where(eq(Announcement.id, id)).get();
    case 'audition':
      return db.select({ ensembleId: Audition.ensembleId }).from(Audition).where(eq(Audition.id, id)).get();
    case 'event':
      return db.select({ ensembleId: Event.ensembleId }).from(Event).where(eq(Event.id, id)).get();
    case 'group':
      return db.select({ ensembleId: Group.ensembleId }).from(Group).where(eq(Group.id, id)).get();
    case 'invite':
      return db.select({ ensembleId: EnsembleInvite.ensembleId }).from(EnsembleInvite).where(eq(EnsembleInvite.id, id)).get();
    case 'link':
      return db.select({ ensembleId: EnsembleLink.ensembleId }).from(EnsembleLink).where(eq(EnsembleLink.id, id)).get();
    case 'membership':
      return db.select({ ensembleId: EnsembleMember.ensembleId }).from(EnsembleMember).where(eq(EnsembleMember.id, id)).get();
    case 'part':
      return db.select({ ensembleId: Part.ensembleId }).from(Part).where(eq(Part.id, id)).get();
    case 'season':
      return db.select({ ensembleId: Season.ensembleId }).from(Season).where(eq(Season.id, id)).get();
    case 'song':
      return db.select({ ensembleId: Song.ensembleId }).from(Song).where(eq(Song.id, id)).get();
    case 'task':
      return db.select({ ensembleId: Task.ensembleId }).from(Task).where(eq(Task.id, id)).get();
    case 'songFile':
      return db
        .select({ ensembleId: Song.ensembleId })
        .from(SongFile)
        .innerJoin(Song, eq(SongFile.songId, Song.id))
        .where(eq(SongFile.id, id))
        .get();
    case 'auditionSignup':
      return db
        .select({ ensembleId: Audition.ensembleId })
        .from(AuditionSignup)
        .innerJoin(Audition, eq(AuditionSignup.auditionId, Audition.id))
        .where(eq(AuditionSignup.id, id))
        .get();
    case 'attendance':
      return db
        .select({ ensembleId: Event.ensembleId })
        .from(Attendance)
        .innerJoin(Event, eq(Attendance.eventId, Event.id))
        .where(eq(Attendance.id, id))
        .get();
    case 'programEntry':
      return db
        .select({ ensembleId: Event.ensembleId })
        .from(EventProgram)
        .innerJoin(Event, eq(EventProgram.eventId, Event.id))
        .where(eq(EventProgram.id, id))
        .get();
  }
}

export async function isInEnsemble(kind: OwnedKind, id: string, ensembleId: string): Promise<boolean> {
  return (await getOwningEnsembleId(kind, id)) === ensembleId;
}

/** Whether every part in `partIds` belongs to the ensemble. An empty list is trivially true. */
export async function partsInEnsemble(partIds: string[], ensembleId: string): Promise<boolean> {
  if (partIds.length === 0) return true;
  const rows = await db
    .select({ id: Part.id })
    .from(Part)
    .where(and(inArray(Part.id, partIds), eq(Part.ensembleId, ensembleId)))
    .all();
  return rows.length === new Set(partIds).size;
}

/** Whether the user has a membership (any status) in the ensemble. */
export async function isUserInEnsemble(userId: string, ensembleId: string): Promise<boolean> {
  const row = await db
    .select({ id: EnsembleMember.id })
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.userId, userId), eq(EnsembleMember.ensembleId, ensembleId)))
    .get();
  return Boolean(row);
}
