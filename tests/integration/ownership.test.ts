import { describe, it, expect } from 'vitest';
import { db, Announcement, Attendance, AuditionSignup, EnsembleLink } from '@db';
import { createAudition } from '../../src/lib/auditions.ts';
import {
  getOwningEnsembleId,
  isInEnsemble,
  isUserInEnsemble,
  partsInEnsemble,
  type OwnedKind,
} from '../../src/lib/ownership.ts';
import {
  createUser,
  createEnsemble,
  createInvite,
  createMembership,
  createSeason,
  createPart,
  createEvent,
  createGroup,
  createSong,
  createSongFile,
  createEventProgramEntry,
  createTask,
} from './fixtures.ts';

// One record of every kind in an ensemble, so each can be checked against a second ensemble.
async function ensembleWithEverything(adminId: string) {
  const ensemble = (await createEnsemble(adminId))!;
  const member = (await createUser())!;
  const membership = (await createMembership(ensemble.id, member.id))!;
  const season = (await createSeason(ensemble.id))!;
  const event = (await createEvent(ensemble.id, season.id))!;
  const song = (await createSong(ensemble.id))!;
  const songFile = (await createSongFile(song.id, adminId))!;
  const programEntry = (await createEventProgramEntry(event.id, song.id))!;

  const announcementId = crypto.randomUUID();
  await db.insert(Announcement).values({
    id: announcementId,
    ensembleId: ensemble.id,
    title: 'Hello',
    content: 'World',
    createdBy: adminId,
  });
  const attendanceId = crypto.randomUUID();
  await db.insert(Attendance).values({ id: attendanceId, eventId: event.id, userId: member.id, checkedInMethod: 'admin' });
  const linkId = crypto.randomUUID();
  await db.insert(EnsembleLink).values({ id: linkId, ensembleId: ensemble.id, label: 'Site', url: 'https://example.com' });

  const auditionId = await createAudition(ensemble.id, { title: 'Solo', songId: song.id });
  const auditionSignupId = crypto.randomUUID();
  await db.insert(AuditionSignup).values({ id: auditionSignupId, auditionId, userId: member.id });

  const ids: Record<OwnedKind, string> = {
    announcement: announcementId,
    attendance: attendanceId,
    audition: auditionId,
    auditionSignup: auditionSignupId,
    event: event.id,
    group: (await createGroup(ensemble.id))!.id,
    invite: (await createInvite(ensemble.id, adminId))!.id,
    link: linkId,
    membership: membership.id,
    part: (await createPart(ensemble.id))!.id,
    programEntry: programEntry.id,
    season: season.id,
    song: song.id,
    songFile: songFile.id,
    task: (await createTask(ensemble.id))!.id,
  };
  return { ensemble, member, ids };
}

describe('getOwningEnsembleId / isInEnsemble', () => {
  it('ties every kind of record to its own ensemble and no other', async () => {
    const admin = await createUser({ role: 'admin' });
    const a = await ensembleWithEverything(admin!.id);
    const b = await ensembleWithEverything(admin!.id);

    for (const [kind, id] of Object.entries(a.ids) as [OwnedKind, string][]) {
      expect(await getOwningEnsembleId(kind, id), kind).toBe(a.ensemble.id);
      expect(await isInEnsemble(kind, id, a.ensemble.id), kind).toBe(true);
      expect(await isInEnsemble(kind, id, b.ensemble.id), kind).toBe(false);
    }
  });

  it('returns null for a record that does not exist', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    expect(await getOwningEnsembleId('membership', 'missing')).toBeNull();
    expect(await isInEnsemble('songFile', 'missing', ensemble!.id)).toBe(false);
  });
});

describe('isUserInEnsemble', () => {
  it('is true only for users with a membership in that ensemble', async () => {
    const admin = await createUser({ role: 'admin' });
    const a = await ensembleWithEverything(admin!.id);
    const b = await ensembleWithEverything(admin!.id);
    expect(await isUserInEnsemble(a.member.id, a.ensemble.id)).toBe(true);
    expect(await isUserInEnsemble(a.member.id, b.ensemble.id)).toBe(false);
  });
});

describe('partsInEnsemble', () => {
  it('accepts only parts that all belong to the ensemble', async () => {
    const admin = await createUser({ role: 'admin' });
    const a = await createEnsemble(admin!.id);
    const b = await createEnsemble(admin!.id);
    const a1 = await createPart(a!.id, { name: 'Soprano' });
    const a2 = await createPart(a!.id, { name: 'Alto' });
    const b1 = await createPart(b!.id, { name: 'Tenor' });

    expect(await partsInEnsemble([a1!.id, a2!.id], a!.id)).toBe(true);
    expect(await partsInEnsemble([a1!.id, b1!.id], a!.id)).toBe(false);
    expect(await partsInEnsemble(['missing'], a!.id)).toBe(false);
    expect(await partsInEnsemble([], a!.id)).toBe(true);
  });
});
