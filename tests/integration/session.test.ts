import { describe, it, expect } from 'vitest';
import { createSession, getSession, getUserFromSession, revokeSessions } from '../../src/lib/session.ts';
import { createPasswordResetToken } from '../../src/lib/auth.ts';
import { resetPassword } from '../../src/lib/profile.ts';
import { createUser } from './fixtures.ts';

describe('createSession + getSession roundtrip', () => {
  it('creates a token that getSession can verify', () => {
    const token = createSession('user-123', 0);
    const payload = getSession(token);
    expect(payload?.userId).toBe('user-123');
  });

  it('returns null for a garbage token', () => {
    expect(getSession('not.a.jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(getSession('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(getSession(undefined)).toBeNull();
  });

  it('creates a token that contains the userId in the payload', () => {
    const token = createSession('my-user-id', 0);
    const payload = getSession(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('my-user-id');
  });
});

describe('getUserFromSession', () => {
  it('retrieves the user matching the session token', async () => {
    const user = await createUser({ email: 'session-test@test.com', name: 'Session User' });
    const token = createSession(user!.id, 0);
    const fetched = await getUserFromSession(token);
    expect(fetched).not.toBeNull();
    expect(fetched!.email).toBe('session-test@test.com');
  });

  it('returns null when the user ID in the token does not exist in the DB', async () => {
    const token = createSession('nonexistent-user-id', 0);
    expect(await getUserFromSession(token)).toBeNull();
  });

  it('returns null for an invalid token', async () => {
    expect(await getUserFromSession('invalid-token')).toBeNull();
  });

  it('returns null for undefined', async () => {
    expect(await getUserFromSession(undefined)).toBeNull();
  });
});

describe('session revocation', () => {
  it('rejects tokens issued before revokeSessions', async () => {
    const user = await createUser({ email: 'revoke@test.com', name: 'Revoke' });
    const oldToken = createSession(user!.id, 0);
    const newVersion = await revokeSessions(user!.id);
    expect(newVersion).toBe(1);
    expect(await getUserFromSession(oldToken)).toBeNull();
    expect((await getUserFromSession(createSession(user!.id, newVersion!)))?.id).toBe(user!.id);
  });

  it('returns null when revoking a user that does not exist', async () => {
    expect(await revokeSessions('nonexistent-user-id')).toBeNull();
  });

  it('signs the user out everywhere when they reset their password', async () => {
    const user = await createUser({ email: 'reset-revoke@test.com', name: 'Reset' });
    const token = createSession(user!.id, 0);
    const resetToken = await createPasswordResetToken(user!.id);
    expect(await resetPassword(resetToken, 'brand-new-password')).toEqual({ type: 'success' });
    expect(await getUserFromSession(token)).toBeNull();
  });
});
