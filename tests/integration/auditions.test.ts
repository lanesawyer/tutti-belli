import { describe, it, expect, vi } from 'vitest';
import { db, eq, Audition, AuditionSignup } from '@db';

vi.mock('../../src/lib/storage.ts', () => ({
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn().mockResolvedValue(undefined),
}));

import {
  createAudition,
  editAudition,
  getAuditions,
  isAcceptingSignups,
  setAuditionStatus,
  setSignupSelected,
  signUpForAudition,
  withdrawFromAudition,
} from '../../src/lib/auditions.ts';
import { deleteSong, editSong } from '../../src/lib/songs.ts';
import { deleteAccount } from '../../src/lib/profile.ts';
import { createUser, createEnsemble, createMembership, createSong } from './fixtures.ts';

async function setup() {
  const admin = (await createUser({ role: 'admin' }))!;
  const ensemble = (await createEnsemble(admin.id))!;
  const alto = (await createUser({ name: 'Alto' }))!;
  const tenor = (await createUser({ name: 'Tenor' }))!;
  await createMembership(ensemble.id, alto.id);
  await createMembership(ensemble.id, tenor.id);
  const song = (await createSong(ensemble.id, { name: 'Ave Maria' }))!;
  const auditionId = await createAudition(ensemble.id, { title: 'Alto solo', songId: song.id });
  return { admin, ensemble, alto, tenor, song, auditionId };
}

const view = async (ensembleId: string, userId: string, isAdmin: boolean) =>
  (await getAuditions({ ensembleId, userId, isAdmin }))[0];

describe('auditions', () => {
  it('lets members sign up, update their note, and withdraw', async () => {
    const { ensemble, alto, auditionId } = await setup();

    expect(await signUpForAudition(auditionId, alto.id, 'first')).toEqual({ type: 'success' });
    expect(await signUpForAudition(auditionId, alto.id, ' second ')).toEqual({ type: 'success' });
    const signups = await db.select().from(AuditionSignup).where(eq(AuditionSignup.auditionId, auditionId)).all();
    expect(signups).toHaveLength(1);
    expect(signups[0].note).toBe('second');
    expect((await view(ensemble.id, alto.id, false)).mySignup?.note).toBe('second');

    expect(await withdrawFromAudition(auditionId, alto.id)).toEqual({ type: 'success' });
    expect((await view(ensemble.id, alto.id, false)).mySignup).toBeNull();
  });

  it('hides other signups from members until the audition closes, then shows only who was selected', async () => {
    const { ensemble, alto, tenor, auditionId } = await setup();
    await signUpForAudition(auditionId, alto.id, undefined);
    await signUpForAudition(auditionId, tenor.id, undefined);
    const altoSignup = (await view(ensemble.id, alto.id, true)).signups.find((s) => s.userId === alto.id)!;
    await setSignupSelected(altoSignup.id, true);

    const whileOpen = await view(ensemble.id, tenor.id, false);
    expect(whileOpen.signups).toEqual([]);
    expect(whileOpen.signupCount).toBe(2);
    expect((await view(ensemble.id, tenor.id, true)).signups.map((s) => s.name)).toEqual(['Alto', 'Tenor']);

    await setAuditionStatus(auditionId, 'closed');
    const afterClose = await view(ensemble.id, tenor.id, false);
    expect(afterClose.signups.map((s) => s.name)).toEqual(['Alto']);
    expect(afterClose.mySignup?.selected).toBe(false);
  });

  it('refuses signups after closing or past the deadline, and withdrawals only after closing', async () => {
    const { ensemble, alto, tenor, auditionId } = await setup();
    await signUpForAudition(auditionId, alto.id, undefined);
    await setAuditionStatus(auditionId, 'closed');
    expect((await signUpForAudition(auditionId, tenor.id, undefined)).type).toBe('error');
    expect((await withdrawFromAudition(auditionId, alto.id)).type).toBe('error');

    await setAuditionStatus(auditionId, 'open');
    await editAudition(auditionId, ensemble.id, { title: 'Alto solo', deadlineDate: '2020-01-01' });
    expect((await signUpForAudition(auditionId, tenor.id, undefined)).type).toBe('error');
    expect((await view(ensemble.id, tenor.id, false)).acceptingSignups).toBe(false);
    expect(await withdrawFromAudition(auditionId, alto.id)).toEqual({ type: 'success' });
  });

  it('reads the deadline in the ensemble timezone, defaulting to the end of the day', async () => {
    const { ensemble, auditionId } = await setup();
    await editAudition(auditionId, ensemble.id, { title: 'Alto solo', deadlineDate: '2026-10-10' });
    const audition = await db.select().from(Audition).where(eq(Audition.id, auditionId)).get();
    expect(audition!.signupDeadline!.toISOString()).toBe('2026-10-11T06:59:00.000Z');
    expect(isAcceptingSignups(audition!, new Date('2026-10-11T06:58:00Z'))).toBe(true);
    expect(isAcceptingSignups(audition!, new Date('2026-10-11T07:00:00Z'))).toBe(false);
  });

  it('keeps a song\'s auditions when the song is edited', async () => {
    const { song, auditionId } = await setup();
    await editSong({ songId: song.id, name: 'Ave Maria (Biebl)', runTimeMinutes: 3, runTimeSeconds: 0, parts: [], seasons: [] });
    expect(await db.select().from(Audition).where(eq(Audition.id, auditionId)).get()).toBeDefined();
  });

  it('cleans up a deleted user\'s signups and keeps auditions whose song is deleted', async () => {
    const { alto, song, auditionId } = await setup();
    await signUpForAudition(auditionId, alto.id, undefined);
    expect((await deleteAccount(alto.id, 'user', 'test123')).type).toBe('redirect');
    expect(await db.select().from(AuditionSignup).where(eq(AuditionSignup.userId, alto.id)).all()).toHaveLength(0);

    await deleteSong(song.id);
    const audition = await db.select().from(Audition).where(eq(Audition.id, auditionId)).get();
    expect(audition?.songId).toBeNull();
  });
});
