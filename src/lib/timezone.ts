/**
 * Event times are entered and shown as wall-clock time in the ensemble's timezone, but stored
 * as absolute instants. The server runs in UTC, so nothing here may rely on its local time.
 */
export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneOptions(): string[] {
  return Intl.supportedValuesOf('timeZone');
}

/** The wall-clock parts of an instant in a timezone. */
function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** How far the timezone's wall clock is ahead of UTC at an instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` (YYYY-MM-DD) and `time` (HH:MM).
 * A time skipped by a daylight-saving jump resolves to the hour after; a repeated one, to the first.
 */
export function zonedTimeToInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const dayMs = 24 * 60 * 60 * 1000;
  const offsetBefore = offsetMs(new Date(wallAsUtc - dayMs), timeZone);
  const offsetAfter = offsetMs(new Date(wallAsUtc + dayMs), timeZone);
  const reads = (instant: number) => {
    const p = zonedParts(new Date(instant), timeZone);
    return p.hour === hour && p.minute === minute && p.day === day;
  };
  const valid = [wallAsUtc - offsetBefore, wallAsUtc - offsetAfter].filter(reads);
  // Skipped times have no valid instant; the offset from before the jump lands an hour later.
  return new Date(valid.length > 0 ? Math.min(...valid) : wallAsUtc - offsetBefore);
}

/** An instant as the date and time values for `<input type="date">` and `<input type="time">`. */
export function instantToZonedInputs(instant: Date, timeZone: string): { date: string; time: string } {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function formatZonedDate(instant: Date, timeZone: string): string {
  return instant.toLocaleDateString('en-US', { timeZone });
}

export function formatZonedTime(instant: Date, timeZone: string): string {
  return instant.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
}
