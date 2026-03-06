import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createEvent as createEventAction,
  checkInToEvent,
  checkInByCode,
  addAttendance,
  removeAttendance,
  addProgramSong,
  removeProgramSong,
  updateProgramSongNotes,
  updateProgramEntry,
  reorderProgramSongs,
  getEventPageData,
  setRsvp,
  removeRsvp,
  isRsvpEnabled,
} from '../../src/lib/events.ts';
import { db, Attendance, Event, EventProgram, EventRsvp, eq, and } from 'astro:db';
import {
  createUser,
  createEnsemble,
  createMembership,
  createSeason,
  createEvent,
  createSong,
  createSeasonSong,
  createEventProgramEntry,
  createGroup,
  createGroupMembership,
} from './fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('createEvent', () => {
  it('creates an event in the active season', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    await createSeason(ensemble!.id, { isActive: 1 });

    await createEventAction({
      ensembleId: ensemble!.id,
      title: 'Spring Concert',
      date: '2026-04-15',
      time: '19:00',
      durationMinutes: 120,
      category: 'performance',
    });

    const events = await db
      .select()
      .from(Event)
      .where(eq(Event.ensembleId, ensemble!.id))
      .all();
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Spring Concert');
    expect(events[0].category).toBe('performance');
  });

  it('throws when there is no active season', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    // No season created

    await expect(
      createEventAction({
        ensembleId: ensemble!.id,
        title: 'Test Event',
        date: '2026-04-15',
        time: '19:00',
        durationMinutes: 90,
        category: 'rehearsal',
      })
    ).rejects.toThrow('No active season');
  });
});

describe('checkInToEvent', () => {
  it('succeeds when checked in within the window', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    // checkInStartMinutes=30, checkInEndMinutes=15
    // Event at 19:00 → window opens 18:30, closes 19:15
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
    });
    const season = await createSeason(ensemble!.id);
    const scheduledAt = new Date('2026-04-15T19:00:00.000Z');
    const event = await createEvent(ensemble!.id, season!.id, { scheduledAt });

    // Set time to 18:45 UTC — 15 min before event, within the 30-min window
    vi.setSystemTime(new Date('2026-04-15T18:45:00.000Z'));

    await expect(
      checkInToEvent({ eventId: event!.id, userId: member!.id, ensembleId: ensemble!.id, isAdmin: false })
    ).resolves.not.toThrow();

    const record = await db
      .select()
      .from(Attendance)
      .where(and(eq(Attendance.eventId, event!.id), eq(Attendance.userId, member!.id)))
      .get();
    expect(record).not.toBeUndefined();
    expect(record!.checkedInMethod).toBe('manual');
  });

  it('throws a too-early error before the window opens', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
    });
    const season = await createSeason(ensemble!.id);
    const scheduledAt = new Date('2026-04-15T19:00:00.000Z');
    const event = await createEvent(ensemble!.id, season!.id, { scheduledAt });

    // Set time to 18:00 UTC — 1 hour before, before the 30-min window
    vi.setSystemTime(new Date('2026-04-15T18:00:00.000Z'));

    await expect(
      checkInToEvent({ eventId: event!.id, userId: member!.id, ensembleId: ensemble!.id, isAdmin: false })
    ).rejects.toThrow(/opens.*minutes before/i);
  });

  it('throws a closed error after the window ends', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
    });
    const season = await createSeason(ensemble!.id);
    const scheduledAt = new Date('2026-04-15T19:00:00.000Z');
    const event = await createEvent(ensemble!.id, season!.id, { scheduledAt });

    // Set time to 19:20 UTC — 20 min after event start, past the 15-min close window
    vi.setSystemTime(new Date('2026-04-15T19:20:00.000Z'));

    await expect(
      checkInToEvent({ eventId: event!.id, userId: member!.id, ensembleId: ensemble!.id, isAdmin: false })
    ).rejects.toThrow(/closed.*minutes after/i);
  });

  it('allows admin to check in outside the window', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
    });
    const season = await createSeason(ensemble!.id);
    const scheduledAt = new Date('2026-04-15T19:00:00.000Z');
    const event = await createEvent(ensemble!.id, season!.id, { scheduledAt });

    // 4 hours before the event — way outside the window
    vi.setSystemTime(new Date('2026-04-15T15:00:00.000Z'));

    await expect(
      checkInToEvent({ eventId: event!.id, userId: admin!.id, ensembleId: ensemble!.id, isAdmin: true })
    ).resolves.not.toThrow();
  });

  it('throws when attempting to check in twice', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 9999,
      checkInEndMinutes: 9999,
    });
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await checkInToEvent({ eventId: event!.id, userId: member!.id, ensembleId: ensemble!.id, isAdmin: false });

    await expect(
      checkInToEvent({ eventId: event!.id, userId: member!.id, ensembleId: ensemble!.id, isAdmin: false })
    ).rejects.toThrow(/already checked in/i);
  });

  it('throws when the event does not exist', async () => {
    const member = await createUser();
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await expect(
      checkInToEvent({ eventId: 'nonexistent-id', userId: member!.id, ensembleId: ensemble!.id, isAdmin: false })
    ).rejects.toThrow(/Event not found/i);
  });
});

describe('checkInByCode', () => {
  it('checks in a user via a valid QR code within the window', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 9999,
      checkInEndMinutes: 9999,
    });
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { checkInCode: 'TESTQR01' });

    const result = await checkInByCode({ code: 'TESTQR01', userId: member!.id });
    expect(result.eventId).toBe(event!.id);
    expect(result.ensembleId).toBe(ensemble!.id);

    const record = await db
      .select()
      .from(Attendance)
      .where(and(eq(Attendance.eventId, event!.id), eq(Attendance.userId, member!.id)))
      .get();
    expect(record!.checkedInMethod).toBe('qr');
  });

  it('is case-insensitive for the check-in code', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 9999,
      checkInEndMinutes: 9999,
    });
    const season = await createSeason(ensemble!.id);
    await createEvent(ensemble!.id, season!.id, { checkInCode: 'ABCDEF01' });

    await expect(
      checkInByCode({ code: 'abcdef01', userId: member!.id })
    ).resolves.not.toThrow();
  });

  it('throws for an invalid check-in code', async () => {
    const member = await createUser();
    await expect(
      checkInByCode({ code: 'INVALID', userId: member!.id })
    ).rejects.toThrow(/Invalid check-in code/i);
  });
});

describe('addAttendance', () => {
  it('adds an attendance record with checkedInMethod=admin', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await addAttendance(event!.id, member!.id);

    const record = await db
      .select()
      .from(Attendance)
      .where(and(eq(Attendance.eventId, event!.id), eq(Attendance.userId, member!.id)))
      .get();
    expect(record).not.toBeUndefined();
    expect(record!.checkedInMethod).toBe('admin');
  });

  it('is idempotent — does not create duplicate records', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await addAttendance(event!.id, member!.id);
    await addAttendance(event!.id, member!.id);

    const records = await db
      .select()
      .from(Attendance)
      .where(and(eq(Attendance.eventId, event!.id), eq(Attendance.userId, member!.id)))
      .all();
    expect(records).toHaveLength(1);
  });
});

describe('removeAttendance', () => {
  it('removes an existing attendance record', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await addAttendance(event!.id, member!.id);
    const record = await db
      .select()
      .from(Attendance)
      .where(and(eq(Attendance.eventId, event!.id), eq(Attendance.userId, member!.id)))
      .get();

    await removeAttendance(record!.id);

    const after = await db
      .select()
      .from(Attendance)
      .where(eq(Attendance.id, record!.id))
      .get();
    expect(after).toBeUndefined();
  });
});

describe('addProgramSong', () => {
  it('adds a song to a rehearsal event', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { category: 'rehearsal' });
    const song = await createSong(ensemble!.id);
    await createSeasonSong(season!.id, song!.id);

    await addProgramSong(event!.id, song!.id);

    const rows = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].songId).toBe(song!.id);
    expect(rows[0].sortOrder).toBe(1);
    expect(rows[0].notes).toBeNull();
  });

  it('adds a song to a performance event', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { category: 'performance' });
    const song = await createSong(ensemble!.id);
    await createSeasonSong(season!.id, song!.id);

    await addProgramSong(event!.id, song!.id);

    const rows = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].songId).toBe(song!.id);
  });

  it('adds a song with length', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);

    await addProgramSong(event!.id, song!.id, 20);

    const row = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).get();
    expect(row!.length).toBe(20);
  });

  it('adds a song with notes', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);

    await addProgramSong(event!.id, song!.id, undefined, 'Focus on intonation in measures 12-16');

    const row = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).get();
    expect(row!.notes).toBe('Focus on intonation in measures 12-16');
  });

  it('adds a song with both length and notes', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);

    await addProgramSong(event!.id, song!.id, 15, 'Work on dynamics');

    const row = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).get();
    expect(row!.length).toBe(15);
    expect(row!.notes).toBe('Work on dynamics');
  });

  it('assigns ascending sortOrder for multiple songs', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song1 = await createSong(ensemble!.id, { name: 'Song A' });
    const song2 = await createSong(ensemble!.id, { name: 'Song B' });

    await addProgramSong(event!.id, song1!.id);
    await addProgramSong(event!.id, song2!.id);

    const rows = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).all();
    const orders = rows.map(r => r.sortOrder).sort((a, b) => a - b);
    expect(orders[1]).toBeGreaterThan(orders[0]);
  });
});

describe('updateProgramSongNotes', () => {
  it('sets notes on an existing program entry', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id);

    await updateProgramSongNotes(entry!.id, 'Work on dynamics');

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.notes).toBe('Work on dynamics');
  });

  it('clears notes when given an empty string', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id, { notes: 'Old notes' });

    await updateProgramSongNotes(entry!.id, '');

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.notes).toBeNull();
  });

  it('trims whitespace-only notes to null', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id, { notes: 'Some notes' });

    await updateProgramSongNotes(entry!.id, '   ');

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.notes).toBeNull();
  });
});

describe('removeProgramSong', () => {
  it('removes an existing program entry', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id);

    await removeProgramSong(entry!.id);

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row).toBeUndefined();
  });
});

describe('updateProgramEntry', () => {
  it('updates length on an existing entry', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id);

    await updateProgramEntry(entry!.id, { length: 30 });

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.length).toBe(30);
  });

  it('clears length when set to null', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id, { length: 20 });

    await updateProgramEntry(entry!.id, { length: null });

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.length).toBeNull();
  });

  it('updates sortOrder on an existing entry', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id, { sortOrder: 1 });

    await updateProgramEntry(entry!.id, { sortOrder: 5 });

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.sortOrder).toBe(5);
  });

  it('updates notes and length together', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id);

    await updateProgramEntry(entry!.id, { notes: 'Watch the tempo', length: 25 });

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.notes).toBe('Watch the tempo');
    expect(row!.length).toBe(25);
  });

  it('trims whitespace-only notes to null', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entry = await createEventProgramEntry(event!.id, song!.id, { notes: 'Old notes' });

    await updateProgramEntry(entry!.id, { notes: '   ' });

    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entry!.id)).get();
    expect(row!.notes).toBeNull();
  });
});

describe('reorderProgramSongs', () => {
  it('updates sortOrder for all entries in the given order', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);
    const song1 = await createSong(ensemble!.id, { name: 'Song A' });
    const song2 = await createSong(ensemble!.id, { name: 'Song B' });
    const song3 = await createSong(ensemble!.id, { name: 'Song C' });
    const entry1 = await createEventProgramEntry(event!.id, song1!.id, { sortOrder: 1 });
    const entry2 = await createEventProgramEntry(event!.id, song2!.id, { sortOrder: 2 });
    const entry3 = await createEventProgramEntry(event!.id, song3!.id, { sortOrder: 3 });

    // Reverse the order: C, A, B
    await reorderProgramSongs(event!.id, [entry3!.id, entry1!.id, entry2!.id]);

    const rows = await db.select().from(EventProgram).where(eq(EventProgram.eventId, event!.id)).all();
    const orderById = Object.fromEntries(rows.map(r => [r.id, r.sortOrder]));
    expect(orderById[entry3!.id]).toBe(1);
    expect(orderById[entry1!.id]).toBe(2);
    expect(orderById[entry2!.id]).toBe(3);
  });

  it('only updates entries belonging to the given event', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event1 = await createEvent(ensemble!.id, season!.id);
    const event2 = await createEvent(ensemble!.id, season!.id);
    const song = await createSong(ensemble!.id);
    const entryOnEvent1 = await createEventProgramEntry(event1!.id, song!.id, { sortOrder: 1 });
    const entryOnEvent2 = await createEventProgramEntry(event2!.id, song!.id, { sortOrder: 1 });

    // Try to reorder event2's entry via event1's reorder call
    await reorderProgramSongs(event1!.id, [entryOnEvent2!.id]);

    // event2's entry should be unchanged
    const row = await db.select().from(EventProgram).where(eq(EventProgram.id, entryOnEvent2!.id)).get();
    expect(row!.sortOrder).toBe(1);
    // event1's entry should also be unchanged (it wasn't in the list)
    const row1 = await db.select().from(EventProgram).where(eq(EventProgram.id, entryOnEvent1!.id)).get();
    expect(row1!.sortOrder).toBe(1);
  });
});

describe('isRsvpEnabled', () => {
  it('returns the category default when rsvpEnabled is null', () => {
    expect(isRsvpEnabled({ category: 'performance', rsvpEnabled: null })).toBe(true);
    expect(isRsvpEnabled({ category: 'social', rsvpEnabled: null })).toBe(true);
    expect(isRsvpEnabled({ category: 'rehearsal', rsvpEnabled: null })).toBe(false);
    expect(isRsvpEnabled({ category: 'sectional', rsvpEnabled: null })).toBe(false);
  });

  it('returns true when rsvpEnabled is 1 regardless of category', () => {
    expect(isRsvpEnabled({ category: 'rehearsal', rsvpEnabled: 1 })).toBe(true);
  });

  it('returns false when rsvpEnabled is 0 regardless of category', () => {
    expect(isRsvpEnabled({ category: 'performance', rsvpEnabled: 0 })).toBe(false);
  });
});

describe('setRsvp', () => {
  it('creates a yes RSVP record', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await setRsvp(event!.id, member!.id, 'yes');

    const record = await db
      .select()
      .from(EventRsvp)
      .where(and(eq(EventRsvp.eventId, event!.id), eq(EventRsvp.userId, member!.id)))
      .get();
    expect(record).not.toBeUndefined();
    expect(record!.response).toBe('yes');
  });

  it('creates a no RSVP record', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await setRsvp(event!.id, member!.id, 'no');

    const record = await db
      .select()
      .from(EventRsvp)
      .where(and(eq(EventRsvp.eventId, event!.id), eq(EventRsvp.userId, member!.id)))
      .get();
    expect(record!.response).toBe('no');
  });

  it('updates an existing RSVP (upsert behavior)', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await setRsvp(event!.id, member!.id, 'yes');
    await setRsvp(event!.id, member!.id, 'no');

    const records = await db
      .select()
      .from(EventRsvp)
      .where(and(eq(EventRsvp.eventId, event!.id), eq(EventRsvp.userId, member!.id)))
      .all();
    expect(records).toHaveLength(1);
    expect(records[0].response).toBe('no');
  });
});

describe('removeRsvp', () => {
  it('removes an existing RSVP record', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await setRsvp(event!.id, member!.id, 'yes');
    await removeRsvp(event!.id, member!.id);

    const record = await db
      .select()
      .from(EventRsvp)
      .where(and(eq(EventRsvp.eventId, event!.id), eq(EventRsvp.userId, member!.id)))
      .get();
    expect(record).toBeUndefined();
  });

  it('is a no-op when no RSVP exists', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await expect(removeRsvp(event!.id, member!.id)).resolves.not.toThrow();
  });
});

describe('getEventPageData — RSVP records', () => {
  it('includes rsvpRecords in return value', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, admin!.id);
    await createMembership(ensemble!.id, member!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id);

    await setRsvp(event!.id, member!.id, 'yes');

    const { rsvpRecords } = await getEventPageData(ensemble!.id, event!.id);

    expect(rsvpRecords).toHaveLength(1);
    expect(rsvpRecords[0].userId).toBe(member!.id);
    expect(rsvpRecords[0].response).toBe('yes');
  });
});

describe('getEventPageData — group scoping', () => {
  it('returns all ensemble members when event has no group', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const member1 = await createUser();
    const member2 = await createUser();
    await createMembership(ensemble!.id, admin!.id);
    await createMembership(ensemble!.id, member1!.id);
    await createMembership(ensemble!.id, member2!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id); // no groupId

    const { allMembers, group } = await getEventPageData(ensemble!.id, event!.id);

    expect(allMembers).toHaveLength(3);
    expect(group).toBeNull();
  });

  it('returns only group members when event has a groupId', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const member1 = await createUser();
    const member2 = await createUser();
    const outsider = await createUser();
    await createMembership(ensemble!.id, admin!.id);
    await createMembership(ensemble!.id, member1!.id);
    await createMembership(ensemble!.id, member2!.id);
    await createMembership(ensemble!.id, outsider!.id);
    const grp = await createGroup(ensemble!.id, { name: 'Board', color: 'warning' });
    await createGroupMembership(grp!.id, admin!.id);
    await createGroupMembership(grp!.id, member1!.id);
    // member2 and outsider are NOT in the group
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { groupId: grp!.id });

    const { allMembers, group } = await getEventPageData(ensemble!.id, event!.id);

    expect(allMembers).toHaveLength(2);
    expect(allMembers.map(m => m.id)).toContain(admin!.id);
    expect(allMembers.map(m => m.id)).toContain(member1!.id);
    expect(group).not.toBeNull();
    expect(group!.name).toBe('Board');
  });

  it('excludes group members who are not ensemble members', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, admin!.id);
    const nonMember = await createUser(); // in group but NOT in ensemble
    const grp = await createGroup(ensemble!.id);
    await createGroupMembership(grp!.id, admin!.id);
    await createGroupMembership(grp!.id, nonMember!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { groupId: grp!.id });

    const { allMembers } = await getEventPageData(ensemble!.id, event!.id);

    expect(allMembers).toHaveLength(1);
    expect(allMembers[0].id).toBe(admin!.id);
  });

  it('falls back to all ensemble members when referenced group was deleted', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const member = await createUser();
    await createMembership(ensemble!.id, admin!.id);
    await createMembership(ensemble!.id, member!.id);
    const grp = await createGroup(ensemble!.id);
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, { groupId: grp!.id });

    // Simulate a deleted group by: clearing the FK on the event, deleting the group,
    // then restoring a dangling groupId via a raw PRAGMA-disabled update.
    // Simpler approach: just clear FK enforcement, set to a deleted id, re-enable.
    await db.run('PRAGMA foreign_keys = OFF');
    await db.update(Event).set({ groupId: 'deleted-group-id' }).where(eq(Event.id, event!.id));
    await db.run('PRAGMA foreign_keys = ON');

    const { allMembers, group } = await getEventPageData(ensemble!.id, event!.id);

    expect(group).toBeNull();
    expect(allMembers).toHaveLength(2);
  });
});
