import { describe, it, expect } from 'vitest';
import { randomCode } from '../../src/lib/codes.ts';

describe('randomCode', () => {
  it('returns 8 uppercase letters and digits by default', () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('honors a custom length', () => {
    expect(randomCode(12)).toHaveLength(12);
  });

  it('uses the whole alphabet and does not repeat codes in practice', () => {
    const codes = Array.from({ length: 2000 }, () => randomCode());
    expect(new Set(codes).size).toBe(codes.length);
    const chars = new Set(codes.join(''));
    expect(chars.size).toBe(36);
  });
});
