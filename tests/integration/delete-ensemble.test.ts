import { describe, it, expect, vi } from 'vitest';
import { db, eq, Announcement, Attendance, Ensemble, EnsembleLink, EventRsvp, SeasonMembership, Song } from '@db';

vi.mock('../../src/lib/storage.ts', () => ({
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn().mockResolvedValue(undefined),
}));

import { deleteImage, deleteStorageFile } from '../../src/lib/storage.ts';
import { deleteEnsemble } from '../../src/lib/admin.ts';
import { createAudition, signUpForAudition } from '../../src/lib/auditions.ts';
import {
  createUser,
  createEnsemble,
  createMembership,
  createInvite,
  createSeason,
  createPart,
  createMemberPart,
  createEvent,
  createEventProgramEntry,
  createGroup,
  createGroupMembership,
  createSong,
  createSongFile,
  createSeasonSong,
  createTask,
  createTaskCompletion,
} from './fixtures.ts';

/** An ensemble with at least one of everything that can belong to it. */
async function fullEnsemble(adminId: string, memberId: string) {
  const ensemble = await createEnsemble(adminId);
  const ensembleId = ensemble!.id;
  const membership = await createMembership(ensembleId, memberId);
  await createInvite(ensembleId, adminId);
  const season = await createSeason(ensembleId);
  const part = await createPart(ensembleId);
  await createMemberPart(membership!.id, part!.id);
  const group = await createGroup(ensembleId);
  await createGroupMembership(group!.id, memberId);
  const event = await createEvent(ensembleId, season!.id, { groupId: group!.id });
  const song = await createSong(ensembleId);
  await createSongFile(song!.id, adminId, { url: `${ensembleId}/songs/score.pdf`, category: 'sheet_music' });
  await createSongFile(song!.id, adminId, { url: 'https://example.com/recording', category: 'link' });
  await createSeasonSong(season!.id, song!.id);
  await createEventProgramEntry(event!.id, song!.id);
  await signUpForAudition(await createAudition(ensembleId, { title: 'Solo', songId: song!.id }), memberId, 'pick me');
  const task = await createTask(ensembleId, { seasonId: season!.id });
  await createTaskCompletion(task!.id, memberId, adminId);
  await db.insert(Attendance).values({ id: crypto.randomUUID(), eventId: event!.id, userId: memberId, checkedInMethod: 'qr' });
  await db.insert(EventRsvp).values({ id: crypto.randomUUID(), eventId: event!.id, userId: memberId, response: 'yes' });
  await db.insert(SeasonMembership).values({ id: crypto.randomUUID(), seasonId: season!.id, userId: memberId });
  await db.insert(Announcement).values({ id: crypto.randomUUID(), ensembleId, title: 'Hi', content: 'x', createdBy: adminId });
  await db.insert(EnsembleLink).values({ id: crypto.randomUUID(), ensembleId, label: 'Site', url: 'https://example.com' });
  await db.update(Ensemble).set({ imageUrl: '/images/ensembles/x.png' }).where(eq(Ensemble.id, ensembleId));
  return ensembleId;
}

describe('deleteEnsemble', () => {
  it('deletes an ensemble with content, its stored files, and nothing from other ensembles', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const doomed = await fullEnsemble(admin!.id, member!.id);
    const kept = await fullEnsemble(admin!.id, member!.id);

    await deleteEnsemble(doomed);

    expect(await db.select().from(Ensemble).where(eq(Ensemble.id, doomed)).get()).toBeUndefined();
    expect(await db.select().from(Song).where(eq(Song.ensembleId, doomed)).all()).toHaveLength(0);
    expect(deleteStorageFile).toHaveBeenCalledWith(`${doomed}/songs/score.pdf`);
    expect(deleteStorageFile).not.toHaveBeenCalledWith('https://example.com/recording');
    expect(deleteImage).toHaveBeenCalledWith('/images/ensembles/x.png');

    expect(await db.select().from(Ensemble).where(eq(Ensemble.id, kept)).get()).toBeDefined();
    expect(await db.select().from(Song).where(eq(Song.ensembleId, kept)).all()).toHaveLength(1);
    expect(await db.select().from(Announcement).where(eq(Announcement.ensembleId, kept)).all()).toHaveLength(1);
  });

  it('does nothing for an ensemble that does not exist', async () => {
    await expect(deleteEnsemble('missing')).resolves.toBeUndefined();
  });
});
