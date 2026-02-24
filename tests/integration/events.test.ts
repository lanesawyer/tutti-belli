import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createEvent as createEventAction,
  checkInToEvent,
  checkInByCode,
  addAttendance,
  removeAttendance,
  getEvent,
} from '../../src/lib/events.ts';
import { db, Attendance, Event, eq, and } from 'astro:db';
import { createUser, createEnsemble, createSeason, createEvent } from './fixtures.ts';

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
