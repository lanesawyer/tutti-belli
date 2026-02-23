import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/auth.ts';

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('produces a different hash each call (salted)', async () => {
    const hash1 = await hashPassword('mypassword');
    const hash2 = await hashPassword('mypassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('correct-password', hash)).toBe(true);
  });

  it('returns false for the wrong password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('returns false for an empty password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('', hash)).toBe(false);
  });
});
