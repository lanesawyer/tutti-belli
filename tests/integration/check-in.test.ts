import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCheckInPageData } from '../../src/lib/ensemble/check-in.ts';
import { createUser, createEnsemble, createSeason, createEvent } from './fixtures.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('getCheckInPageData', () => {
  it('returns event, ensemble, and window flags for a valid code within the window', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, {
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
    });
    const season = await createSeason(ensemble!.id);
    const event = await createEvent(ensemble!.id, season!.id, {
      checkInCode: 'VALIDCODE',
      scheduledAt: new Date('2026-04-15T19:00:00.000Z'),
    });

    vi.setSystemTime(new Date('2026-04-15T18:45:00.000Z'));

    const result = await getCheckInPageData('VALIDCODE');

    expect(result).not.toBeNull();
    expect(result!.event.id).toBe(event!.id);
    expect(result!.ensemble.id).toBe(ensemble!.id);
    expect(result!.canCheckIn).toBe(true);
    expect(result!.isTooEarly).toBe(false);
    expect(result!.isTooLate).toBe(false);
  });

  it('is case-insensitive for the check-in code', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    await createEvent(ensemble!.id, season!.id, {
      checkInCode: 'MIXEDCASE',
      scheduledAt: new Date('2026-04-15T19:00:00.000Z'),
    });

    vi.setSystemTime(new Date('2026-04-15T18:45:00.000Z'));

    const result = await getCheckInPageData('mixedcase');
    expect(result).not.toBeNull();
    expect(result!.canCheckIn).toBe(true);
  });

  it('returns null for an unknown code', async () => {
    const result = await getCheckInPageData('DOESNOTEXIST');
    expect(result).toBeNull();
  });

  it('sets isTooEarly when before the check-in window', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, { checkInStartMinutes: 30 });
    const season = await createSeason(ensemble!.id);
    await createEvent(ensemble!.id, season!.id, {
      checkInCode: 'EARLYCODE',
      scheduledAt: new Date('2026-04-15T19:00:00.000Z'),
    });

    // 45 minutes before — window opens at 18:30
    vi.setSystemTime(new Date('2026-04-15T18:14:00.000Z'));

    const result = await getCheckInPageData('EARLYCODE');
    expect(result).not.toBeNull();
    expect(result!.canCheckIn).toBe(false);
    expect(result!.isTooEarly).toBe(true);
    expect(result!.isTooLate).toBe(false);
  });

  it('sets isTooLate when after the check-in window', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, { checkInEndMinutes: 15 });
    const season = await createSeason(ensemble!.id);
    await createEvent(ensemble!.id, season!.id, {
      checkInCode: 'LATECODE',
      scheduledAt: new Date('2026-04-15T19:00:00.000Z'),
    });

    // 20 minutes after start — window closes at 19:15
    vi.setSystemTime(new Date('2026-04-15T19:20:00.000Z'));

    const result = await getCheckInPageData('LATECODE');
    expect(result).not.toBeNull();
    expect(result!.canCheckIn).toBe(false);
    expect(result!.isTooEarly).toBe(false);
    expect(result!.isTooLate).toBe(true);
  });

  it('returns the correct ensemble and event data', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, {
      name: 'Chamber Choir',
      checkInStartMinutes: 20,
      checkInEndMinutes: 10,
    });
    const season = await createSeason(ensemble!.id);
    await createEvent(ensemble!.id, season!.id, {
      checkInCode: 'DATACHECK',
      title: 'Spring Concert',
      category: 'performance',
      scheduledAt: new Date('2026-04-15T19:00:00.000Z'),
    });

    vi.setSystemTime(new Date('2026-04-15T18:50:00.000Z'));

    const result = await getCheckInPageData('DATACHECK');
    expect(result!.event.title).toBe('Spring Concert');
    expect(result!.event.category).toBe('performance');
    expect(result!.ensemble.name).toBe('Chamber Choir');
    expect(result!.ensemble.checkInStartMinutes).toBe(20);
    expect(result!.ensemble.checkInEndMinutes).toBe(10);
  });
});
