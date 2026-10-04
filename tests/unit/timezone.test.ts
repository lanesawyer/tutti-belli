import { describe, it, expect } from 'vitest';
import {
  formatZonedDate,
  formatZonedTime,
  instantToZonedInputs,
  isValidTimeZone,
  zonedTimeToInstant,
} from '../../src/lib/timezone.ts';

const LA = 'America/Los_Angeles';

describe('zonedTimeToInstant', () => {
  it('reads the time as wall-clock time in the timezone, across daylight saving', () => {
    expect(zonedTimeToInstant('2026-10-03', '18:25', LA).toISOString()).toBe('2026-10-04T01:25:00.000Z');
    expect(zonedTimeToInstant('2026-12-01', '18:25', LA).toISOString()).toBe('2026-12-02T02:25:00.000Z');
    expect(zonedTimeToInstant('2026-10-03', '18:25', 'Asia/Kolkata').toISOString()).toBe('2026-10-03T12:55:00.000Z');
    expect(zonedTimeToInstant('2026-10-03', '00:15', 'Pacific/Auckland').toISOString()).toBe('2026-10-02T11:15:00.000Z');
  });

  it('moves a time skipped by spring-forward an hour later, and picks the first of a repeated time', () => {
    expect(formatZonedTime(zonedTimeToInstant('2026-03-08', '02:30', LA), LA)).toBe('3:30 AM');
    expect(zonedTimeToInstant('2026-11-01', '01:30', LA).toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });
});

describe('showing times', () => {
  it('round-trips through the form inputs and formats in the timezone, not the server', () => {
    const instant = zonedTimeToInstant('2026-10-03', '18:25', LA);

    expect(instantToZonedInputs(instant, LA)).toEqual({ date: '2026-10-03', time: '18:25' });
    expect(formatZonedDate(instant, LA)).toBe('10/3/2026');
    expect(formatZonedTime(instant, LA)).toBe('6:25 PM');
    expect(formatZonedDate(instant, 'UTC')).toBe('10/4/2026');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone(LA)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
