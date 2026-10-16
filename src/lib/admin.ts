import {
  db,
  eq,
  inArray,
  Announcement,
  Attendance,
  Audition,
  AuditionSignup,
  Ensemble,
  EnsembleInvite,
  EnsembleLink,
  EnsembleMember,
  Event,
  EventProgram,
  EventRsvp,
  Group,
  GroupMembership,
  MemberPart,
  Part,
  Season,
  SeasonMembership,
  SeasonSong,
  Song,
  SongFile,
  SongPart,
  Task,
  TaskCompletion,
  User,
} from '@db';
import { findUniqueSlug } from './slug';
import { deleteImage, deleteStorageFile } from './storage';

export async function getAllEnsembles() {
  return await db.select().from(Ensemble).all();
}

export async function getAllUsers() {
  return await db.select().from(User).all();
}

export async function getSiteAdminIds(): Promise<Set<string>> {
  const rows = await db.select({ id: User.id }).from(User).where(eq(User.role, 'admin')).all();
  return new Set(rows.map((r) => r.id));
}

export async function getUserById(userId: string) {
  return (await db.select().from(User).where(eq(User.id, userId)).get()) ?? null;
}

export async function setUserRole(userId: string, role: 'admin' | 'user') {
  await db.update(User).set({ role }).where(eq(User.id, userId));
}

/** Creates an ensemble with the creator as its first admin. */
export async function createEnsemble(params: { name: string; description: string; createdBy: string }) {
  const id = crypto.randomUUID();
  const slug = await findUniqueSlug(params.name, id);
  await db.insert(Ensemble).values({
    id,
    name: params.name,
    slug,
    description: params.description,
    createdBy: params.createdBy,
  });
  await db.insert(EnsembleMember).values({
    id: crypto.randomUUID(),
    ensembleId: id,
    userId: params.createdBy,
    role: 'admin',
    status: 'active',
  });
  return { id, slug };
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

/**
 * Deletes an ensemble and everything in it, children before parents since foreign keys are
 * enforced. Stored files go last, once nothing in the database points at them.
 */
export async function deleteEnsemble(ensembleId: string) {
  const ensemble = await db.select({ imageUrl: Ensemble.imageUrl }).from(Ensemble).where(eq(Ensemble.id, ensembleId)).get();
  if (!ensemble) return;

  const eventIds = ids(await db.select({ id: Event.id }).from(Event).where(eq(Event.ensembleId, ensembleId)).all());
  if (eventIds.length > 0) {
    await db.delete(Attendance).where(inArray(Attendance.eventId, eventIds));
    await db.delete(EventRsvp).where(inArray(EventRsvp.eventId, eventIds));
    await db.delete(EventProgram).where(inArray(EventProgram.eventId, eventIds));
    await db.delete(Event).where(inArray(Event.id, eventIds));
  }

  const auditionIds = ids(await db.select({ id: Audition.id }).from(Audition).where(eq(Audition.ensembleId, ensembleId)).all());
  if (auditionIds.length > 0) {
    await db.delete(AuditionSignup).where(inArray(AuditionSignup.auditionId, auditionIds));
    await db.delete(Audition).where(inArray(Audition.id, auditionIds));
  }

  const songIds = ids(await db.select({ id: Song.id }).from(Song).where(eq(Song.ensembleId, ensembleId)).all());
  const songFiles =
    songIds.length > 0
      ? await db
          .select({ url: SongFile.url, category: SongFile.category })
          .from(SongFile)
          .where(inArray(SongFile.songId, songIds))
          .all()
      : [];
  if (songIds.length > 0) {
    await db.delete(EventProgram).where(inArray(EventProgram.songId, songIds));
    await db.delete(SongFile).where(inArray(SongFile.songId, songIds));
    await db.delete(SongPart).where(inArray(SongPart.songId, songIds));
    await db.delete(SeasonSong).where(inArray(SeasonSong.songId, songIds));
    await db.delete(Song).where(inArray(Song.id, songIds));
  }

  const taskIds = ids(await db.select({ id: Task.id }).from(Task).where(eq(Task.ensembleId, ensembleId)).all());
  if (taskIds.length > 0) {
    await db.delete(TaskCompletion).where(inArray(TaskCompletion.taskId, taskIds));
    await db.delete(Task).where(inArray(Task.id, taskIds));
  }

  const seasonIds = ids(await db.select({ id: Season.id }).from(Season).where(eq(Season.ensembleId, ensembleId)).all());
  if (seasonIds.length > 0) {
    await db.delete(SeasonMembership).where(inArray(SeasonMembership.seasonId, seasonIds));
    await db.delete(SeasonSong).where(inArray(SeasonSong.seasonId, seasonIds));
    await db.delete(Season).where(inArray(Season.id, seasonIds));
  }

  const groupIds = ids(await db.select({ id: Group.id }).from(Group).where(eq(Group.ensembleId, ensembleId)).all());
  if (groupIds.length > 0) {
    await db.delete(GroupMembership).where(inArray(GroupMembership.groupId, groupIds));
    await db.delete(Group).where(inArray(Group.id, groupIds));
  }

  const memberIds = ids(
    await db.select({ id: EnsembleMember.id }).from(EnsembleMember).where(eq(EnsembleMember.ensembleId, ensembleId)).all(),
  );
  if (memberIds.length > 0) {
    await db.delete(MemberPart).where(inArray(MemberPart.membershipId, memberIds));
    await db.delete(EnsembleMember).where(inArray(EnsembleMember.id, memberIds));
  }

  const partIds = ids(await db.select({ id: Part.id }).from(Part).where(eq(Part.ensembleId, ensembleId)).all());
  if (partIds.length > 0) {
    await db.delete(MemberPart).where(inArray(MemberPart.partId, partIds));
    await db.delete(SongPart).where(inArray(SongPart.partId, partIds));
    await db.delete(Part).where(inArray(Part.id, partIds));
  }

  await db.delete(EnsembleInvite).where(eq(EnsembleInvite.ensembleId, ensembleId));
  await db.delete(EnsembleLink).where(eq(EnsembleLink.ensembleId, ensembleId));
  await db.delete(Announcement).where(eq(Announcement.ensembleId, ensembleId));
  await db.delete(Ensemble).where(eq(Ensemble.id, ensembleId));

  await Promise.all(songFiles.filter((f) => f.category !== 'link').map((f) => deleteStorageFile(f.url)));
  await deleteImage(ensemble.imageUrl);
}
