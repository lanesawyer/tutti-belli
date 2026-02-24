import { describe, it, expect } from 'vitest';
import { getInitials, getColorFromInitials } from '../../src/lib/avatar.ts';

describe('getInitials', () => {
  it('returns first two chars uppercased for a single-word name', () => {
    expect(getInitials('Madonna')).toBe('MA');
  });

  it('returns first and last initials for two-word name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first and last initials for three-word name', () => {
    expect(getInitials('Mary Jane Watson')).toBe('MW');
  });

  it('trims leading and trailing whitespace before processing', () => {
    expect(getInitials('  Jane Doe  ')).toBe('JD');
  });

  it('returns uppercase initials', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('handles a single character name', () => {
    expect(getInitials('A')).toBe('A');
  });
});

describe('getColorFromInitials', () => {
  it('returns an HSL color string', () => {
    expect(getColorFromInitials('JD')).toMatch(/^hsl\(\d+, 65%, 50%\)$/);
  });

  it('is deterministic — same initials always produce the same color', () => {
    expect(getColorFromInitials('AB')).toBe(getColorFromInitials('AB'));
  });

  it('produces different colors for different initials', () => {
    expect(getColorFromInitials('AB')).not.toBe(getColorFromInitials('XY'));
  });

  it('hue is in the 0–359 range', () => {
    const color = getColorFromInitials('ZZ');
    const match = color.match(/hsl\((\d+)/);
    const hue = parseInt(match?.[1] ?? '0');
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
});
