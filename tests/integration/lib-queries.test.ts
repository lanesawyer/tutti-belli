import { describe, it, expect } from 'vitest';
import { db, eq, and, Announcement, EnsembleInvite, EnsembleMember, Part, SeasonMembership } from '@db';
import {
  addPart,
  approveMember,
  createInvite,
  deleteInvite,
  deletePart,
  editPart,
  getEnsembleInvites,
  getEnsembleMembersOverview,
  getPendingMembers,
} from '../../src/lib/ensemble.ts';
import { createEnsemble as createEnsembleWithAdmin, deleteEnsemble, getUserById, setUserRole } from '../../src/lib/admin.ts';
import { getEnsembleAnnouncements } from '../../src/lib/announcements.ts';
import { getActiveSeasonRepertoire } from '../../src/lib/songs.ts';
import { getTimedProgramEntries, getUpcomingEvents } from '../../src/lib/events.ts';
import {
  createUser,
  createEnsemble,
  createMembership,
  createSeason,
  createPart,
  createMemberPart,
  createEvent,
  createGroup,
  createGroupMembership,
  createSong,
  createSeasonSong,
  createEventProgramEntry,
} from './fixtures.ts';

const HOUR = 60 * 60 * 1000;

describe('approveMember', () => {
  it('activates the membership and adds the member to the active season once', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id, { isActive: 1 });
    const membership = await createMembership(ensemble!.id, member!.id, { status: 'pending' });

    expect(await approveMember(membership!.id)).toBe(true);
    expect(await approveMember(membership!.id)).toBe(true);

    const after = await db.select().from(EnsembleMember).where(eq(EnsembleMember.id, membership!.id)).get();
    expect(after!.status).toBe('active');
    const seasonRows = await db
      .select()
      .from(SeasonMembership)
      .where(and(eq(SeasonMembership.seasonId, season!.id), eq(SeasonMembership.userId, member!.id)))
      .all();
    expect(seasonRows).toHaveLength(1);
    expect(await getPendingMembers(ensemble!.id)).toHaveLength(0);
  });

  it('returns false for a membership that does not exist', async () => {
    expect(await approveMember('missing')).toBe(false);
  });
});

describe('parts', () => {
  it('adds, edits, and deletes parts only within their ensemble', async () => {
    const admin = await createUser();
    const a = await createEnsemble(admin!.id);
    const b = await createEnsemble(admin!.id);
    await addPart(a!.id, 'Soprano', 1);
    const [part] = await db.select().from(Part).where(eq(Part.ensembleId, a!.id)).all();

    await editPart(part.id, b!.id, 'Hijacked', 9);
    expect((await db.select().from(Part).where(eq(Part.id, part.id)).get())!.name).toBe('Soprano');
    await editPart(part.id, a!.id, 'Alto', 2);
    expect((await db.select().from(Part).where(eq(Part.id, part.id)).get())!.name).toBe('Alto');

    await deletePart(part.id, b!.id);
    expect(await db.select().from(Part).where(eq(Part.id, part.id)).get()).toBeDefined();
    expect(await deletePart(part.id, a!.id)).toEqual({ ok: true });
    expect(await db.select().from(Part).where(eq(Part.id, part.id)).get()).toBeUndefined();
  });

  it('refuses to delete a part that members are assigned to', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const membership = await createMembership(ensemble!.id, admin!.id);
    const part = await createPart(ensemble!.id);
    await createMemberPart(membership!.id, part!.id);

    expect(await deletePart(part!.id, ensemble!.id)).toEqual({
      ok: false,
      error: 'Cannot delete a part that has members assigned to it.',
    });
  });
});

describe('invites', () => {
  it('creates invites and deletes them only within their ensemble', async () => {
    const admin = await createUser();
    const a = await createEnsemble(admin!.id);
    const b = await createEnsemble(admin!.id);
    await createInvite(a!.id, 'CODE0001', admin!.id);
    const [invite] = await getEnsembleInvites(a!.id);
    expect(invite.code).toBe('CODE0001');

    await deleteInvite(invite.id, b!.id);
    expect(await getEnsembleInvites(a!.id)).toHaveLength(1);
    await deleteInvite(invite.id, a!.id);
    expect(await db.select().from(EnsembleInvite).where(eq(EnsembleInvite.id, invite.id)).get()).toBeUndefined();
  });
});

describe('getEnsembleMembersOverview', () => {
  it("only includes group memberships from the ensemble's own groups", async () => {
    const admin = await createUser();
    const member = await createUser();
    const a = await createEnsemble(admin!.id);
    const b = await createEnsemble(admin!.id);
    await createMembership(a!.id, member!.id);
    await createMembership(b!.id, member!.id);
    const groupA = await createGroup(a!.id, { name: 'Leaders' });
    const groupB = await createGroup(b!.id, { name: 'Board' });
    await createGroupMembership(groupA!.id, member!.id);
    await createGroupMembership(groupB!.id, member!.id);

    const overview = await getEnsembleMembersOverview(a!.id);
    expect(overview.members.map((m) => m.id)).toEqual([member!.id]);
    expect(overview.groups.map((g) => g.id)).toEqual([groupA!.id]);
    expect(overview.groupMemberships).toEqual([{ groupId: groupA!.id, userId: member!.id }]);
  });
});

describe('getUpcomingEvents', () => {
  it("shows open and the user's group events, hides other groups' and finished events", async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const mine = await createGroup(ensemble!.id, { name: 'Mine' });
    const other = await createGroup(ensemble!.id, { name: 'Other' });
    await createGroupMembership(mine!.id, member!.id);
    const soon = new Date(Date.now() + HOUR);

    const open = await createEvent(ensemble!.id, season!.id, { title: 'Open', scheduledAt: soon });
    const ours = await createEvent(ensemble!.id, season!.id, { title: 'Ours', scheduledAt: soon, groupId: mine!.id });
    const theirs = await createEvent(ensemble!.id, season!.id, { title: 'Theirs', scheduledAt: soon, groupId: other!.id });
    await createEvent(ensemble!.id, season!.id, { title: 'Done', scheduledAt: new Date(Date.now() - 5 * HOUR) });

    const forMember = await getUpcomingEvents({ ensembleId: ensemble!.id, userId: member!.id, isAdmin: false });
    expect(forMember.events.map((e) => e.id).sort()).toEqual([open!.id, ours!.id].sort());

    const forAdmin = await getUpcomingEvents({ ensembleId: ensemble!.id, userId: admin!.id, isAdmin: true });
    expect(forAdmin.events.map((e) => e.id).sort()).toEqual([open!.id, ours!.id, theirs!.id].sort());
  });

  it('attaches each event program in order', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { scheduledAt: new Date(Date.now() + HOUR) });
    const first = await createSong(ensemble!.id, { name: 'First' });
    const second = await createSong(ensemble!.id, { name: 'Second' });
    await createEventProgramEntry(event!.id, second!.id, { sortOrder: 2 });
    await createEventProgramEntry(event!.id, first!.id, { sortOrder: 1 });

    const { programByEventId } = await getUpcomingEvents({ ensembleId: ensemble!.id, userId: admin!.id, isAdmin: true });
    expect(programByEventId.get(event!.id)!.map((p) => p.songName)).toEqual(['First', 'Second']);
  });
});

describe('getTimedProgramEntries', () => {
  it('returns only entries with a length, named by song', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const timed = await createSong(ensemble!.id, { name: 'Timed' });
    const untimed = await createSong(ensemble!.id, { name: 'Untimed' });
    await createEventProgramEntry(event!.id, timed!.id, { sortOrder: 1, length: 300 });
    await createEventProgramEntry(event!.id, untimed!.id, { sortOrder: 2 });

    const entries = await getTimedProgramEntries(event!.id);
    expect(entries.map((e) => e.displayName)).toEqual(['Timed']);
  });
});

describe('getActiveSeasonRepertoire', () => {
  it('returns the active season songs sorted by name, or null without an active season', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    expect(await getActiveSeasonRepertoire(ensemble!.id)).toBeNull();

    const season = await createSeason(ensemble!.id, { isActive: 1 });
    const b = await createSong(ensemble!.id, { name: 'Beta' });
    const a = await createSong(ensemble!.id, { name: 'Alpha' });
    await createSeasonSong(season!.id, b!.id);
    await createSeasonSong(season!.id, a!.id);

    const repertoire = await getActiveSeasonRepertoire(ensemble!.id);
    expect(repertoire!.season.id).toBe(season!.id);
    expect(repertoire!.songs.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('getEnsembleAnnouncements', () => {
  it('honors the limit, newest first', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    for (let i = 1; i <= 4; i++) {
      const at = new Date(2026, 0, i);
      await db.insert(Announcement).values({
        id: crypto.randomUUID(),
        ensembleId: ensemble!.id,
        title: `A${i}`,
        content: 'x',
        createdBy: admin!.id,
        createdAt: at,
        updatedAt: at,
      });
    }
    expect((await getEnsembleAnnouncements(ensemble!.id, 3)).map((a) => a.title)).toEqual(['A4', 'A3', 'A2']);
    expect(await getEnsembleAnnouncements(ensemble!.id)).toHaveLength(4);
  });
});

describe('admin helpers', () => {
  it('creates an ensemble with its creator as admin, and deletes it', async () => {
    const creator = await createUser();
    const { id, slug } = await createEnsembleWithAdmin({ name: 'New Choir', description: '', createdBy: creator!.id });
    expect(slug).toBe('new-choir');
    const membership = await db.select().from(EnsembleMember).where(eq(EnsembleMember.ensembleId, id)).get();
    expect(membership).toMatchObject({ userId: creator!.id, role: 'admin', status: 'active' });

    await deleteEnsemble(id);
    expect(await db.select().from(EnsembleMember).where(eq(EnsembleMember.ensembleId, id)).all()).toHaveLength(0);
  });

  it('looks up and changes a user role', async () => {
    const user = await createUser();
    await setUserRole(user!.id, 'admin');
    expect((await getUserById(user!.id))!.role).toBe('admin');
    expect(await getUserById('missing')).toBeNull();
  });
});
