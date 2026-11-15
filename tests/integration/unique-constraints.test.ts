import { describe, it, expect } from 'vitest';
import {
  db,
  eq,
  Attendance,
  EnsembleMember,
  EventRsvp,
  GroupMembership,
  MemberPart,
  SeasonMembership,
  SeasonSong,
  SongPart,
  TaskCompletion,
} from '@db';
import { addAttendance, checkInByCode, checkInToEvent, setRsvp } from '../../src/lib/events.ts';
import { addMemberByEmail, approveMember, joinEnsembleWithCode } from '../../src/lib/ensemble.ts';
import { markTaskComplete } from '../../src/lib/tasks.ts';
import { toggleGroupMember } from '../../src/lib/groups.ts';
import { toggleSeasonMember } from '../../src/lib/seasons.ts';
import { addSong, editSong } from '../../src/lib/songs.ts';
import { updateParts } from '../../src/lib/profile.ts';
import {
  createUser,
  createEnsemble,
  createMembership,
  createInvite,
  createSeason,
  createPart,
  createEvent,
  createGroup,
  createSong,
  createTask,
} from './fixtures.ts';

async function setup() {
  const admin = await createUser({ role: 'admin' });
  const member = await createUser();
  const ensemble = await createEnsemble(admin.id);
  const season = await createSeason(ensemble.id);
  await createMembership(ensemble.id, member.id);
  const event = await createEvent(ensemble.id, season.id, { scheduledAt: new Date(), checkInCode: 'DOUBLE' });
  return { admin, member, ensemble, season, event };
}

const rows = async (table: typeof Attendance | typeof EventRsvp) => db.select().from(table).all();

describe('attendance is unique per event and user', () => {
  it('a double-submitted QR check-in records one attendance and reports the duplicate', async () => {
    const { member } = await setup();
    const results = await Promise.allSettled([
      checkInByCode({ code: 'DOUBLE', userId: member.id }),
      checkInByCode({ code: 'DOUBLE', userId: member.id }),
    ]);
    expect(await rows(Attendance)).toHaveLength(1);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toBe('You have already checked in for this event.');
  });

  it('a double-submitted manual check-in records one attendance', async () => {
    const { member, ensemble, event } = await setup();
    const params = { eventId: event.id, userId: member.id, ensembleId: ensemble.id, isAdmin: false };
    const results = await Promise.allSettled([checkInToEvent(params), checkInToEvent(params)]);
    expect(await rows(Attendance)).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('an admin marking someone present twice records one attendance', async () => {
    const { member, event } = await setup();
    await Promise.all([addAttendance(event.id, member.id), addAttendance(event.id, member.id)]);
    expect(await rows(Attendance)).toHaveLength(1);
  });
});

describe('RSVPs are unique per event and user', () => {
  it('two concurrent RSVPs leave one row', async () => {
    const { member, event } = await setup();
    await Promise.all([setRsvp(event.id, member.id, 'yes'), setRsvp(event.id, member.id, 'no')]);
    expect(await rows(EventRsvp)).toHaveLength(1);
  });

  it('changing an RSVP updates the response and time', async () => {
    const { member, event } = await setup();
    await setRsvp(event.id, member.id, 'yes');
    const first = await db.select().from(EventRsvp).get();
    await new Promise((r) => setTimeout(r, 5));
    await setRsvp(event.id, member.id, 'no');
    const all = await db.select().from(EventRsvp).all();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(first!.id);
    expect(all[0].response).toBe('no');
    expect(all[0].respondedAt.getTime()).toBeGreaterThan(first!.respondedAt.getTime());
  });
});

describe('ensemble membership is unique per ensemble and user', () => {
  it('joining twice at once creates one pending membership', async () => {
    const { admin, ensemble } = await setup();
    const joiner = await createUser();
    await createInvite(ensemble.id, admin.id, { code: 'JOINME' });
    const results = await Promise.all([
      joinEnsembleWithCode(joiner.id, 'JOINME', true),
      joinEnsembleWithCode(joiner.id, 'JOINME', true),
    ]);
    const memberships = await db.select().from(EnsembleMember).where(eq(EnsembleMember.userId, joiner.id)).all();
    expect(memberships).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'You are already a member of this ensemble' });
  });

  it('adding the same existing user twice at once creates one membership', async () => {
    const { ensemble } = await setup();
    const person = await createUser({ email: 'person@test.com' });
    await Promise.all([
      addMemberByEmail(ensemble.id, { name: '', email: 'person@test.com', role: 'member' }),
      addMemberByEmail(ensemble.id, { name: '', email: 'person@test.com', role: 'member' }),
    ]);
    const memberships = await db.select().from(EnsembleMember).where(eq(EnsembleMember.userId, person.id)).all();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].status).toBe('active');
  });
});

describe('season membership is unique per season and user', () => {
  it('approving a member twice at once adds them to the active season once', async () => {
    const { ensemble } = await setup();
    const pending = await createMembership(ensemble.id, (await createUser()).id, { status: 'pending' });
    await Promise.all([approveMember(pending.id), approveMember(pending.id)]);
    expect(await db.select().from(SeasonMembership).all()).toHaveLength(1);
  });

  it('two concurrent toggles that both mean "add" leave one row', async () => {
    const { member, season } = await setup();
    await Promise.all([toggleSeasonMember(season.id, member.id), toggleSeasonMember(season.id, member.id)]);
    expect(await db.select().from(SeasonMembership).all()).toHaveLength(1);
  });
});

describe('group membership is unique per group and user', () => {
  it('two concurrent toggles that both mean "add" leave one row', async () => {
    const { member, ensemble } = await setup();
    const group = await createGroup(ensemble.id);
    await Promise.all([toggleGroupMember(group.id, member.id), toggleGroupMember(group.id, member.id)]);
    expect(await db.select().from(GroupMembership).all()).toHaveLength(1);
  });
});

describe('task completion is unique per task and user', () => {
  it('marking a task complete twice at once records one completion', async () => {
    const { admin, member, ensemble } = await setup();
    const task = await createTask(ensemble.id);
    await Promise.all([markTaskComplete(task.id, member.id, admin.id), markTaskComplete(task.id, member.id, admin.id)]);
    expect(await db.select().from(TaskCompletion).all()).toHaveLength(1);
  });
});

describe('song parts and season songs are unique', () => {
  it('addSong with a repeated part and season stores each link once', async () => {
    const { ensemble, season } = await setup();
    const part = await createPart(ensemble.id);
    await addSong(ensemble.id, {
      name: 'Dup',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [part.id, part.id],
      seasons: [season.id, season.id],
    });
    expect(await db.select().from(SongPart).all()).toHaveLength(1);
    expect(await db.select().from(SeasonSong).all()).toHaveLength(1);
  });

  it('editSong with a repeated part and season stores each link once', async () => {
    const { ensemble, season } = await setup();
    const part = await createPart(ensemble.id);
    const song = await createSong(ensemble.id);
    await editSong({
      songId: song.id,
      name: 'Dup',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [part.id, part.id],
      seasons: [season.id, season.id],
    });
    expect(await db.select().from(SongPart).all()).toHaveLength(1);
    expect(await db.select().from(SeasonSong).all()).toHaveLength(1);
  });
});

describe('member parts are unique per membership and part', () => {
  it('two concurrent part updates leave one assignment per part', async () => {
    const { ensemble, member } = await setup();
    const membership = (await db.select().from(EnsembleMember).where(eq(EnsembleMember.userId, member.id)).get())!;
    const part = await createPart(ensemble.id);
    await Promise.all([updateParts(membership.id, [part.id]), updateParts(membership.id, [part.id])]);
    expect(await db.select().from(MemberPart).all()).toHaveLength(1);
  });
});
