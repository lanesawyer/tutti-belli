import { describe, it, expect } from 'vitest';
import { formatDuration } from '../../src/lib/format.ts';

describe('formatDuration', () => {
  it('returns minutes only when less than an hour', () => {
    expect(formatDuration(45)).toBe('45 min');
  });

  it('returns minutes only for exactly 1 minute', () => {
    expect(formatDuration(1)).toBe('1 min');
  });

  it('returns hours only when evenly divisible', () => {
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(120)).toBe('2 hours');
  });

  it('returns hours and minutes when not evenly divisible', () => {
    expect(formatDuration(90)).toBe('1 hour 30 min');
    expect(formatDuration(130)).toBe('2 hours 10 min');
  });

  it('uses singular "hour" for exactly 1 hour', () => {
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(75)).toBe('1 hour 15 min');
  });

  it('uses plural "hours" for more than 1 hour', () => {
    expect(formatDuration(120)).toBe('2 hours');
    expect(formatDuration(150)).toBe('2 hours 30 min');
  });
});
