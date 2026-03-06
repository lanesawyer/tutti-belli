import { describe, it, expect, vi } from 'vitest';
import { registerUser, resendVerificationEmail, updateName, updatePhone, deleteAccount, updateParts, verifyEmailToken, verifyEmailChangeToken, validatePasswordResetToken, resetPassword } from '../../src/lib/profile.ts';
import { db, User, EnsembleMember, MemberPart, EmailVerificationToken, EmailChangeToken, PasswordResetToken, eq } from 'astro:db';
import { createUser, createEnsemble, createMembership, createPart, createMemberPart } from './fixtures.ts';

// Mock email module — we don't want to call the real Resend API in tests
vi.mock('../../src/lib/email.ts', () => ({
  sendEmailVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendAnnouncementEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe('registerUser', () => {
  it('creates a new user and returns their userId', async () => {
    const result = await registerUser({
      name: 'Alice Smith',
      email: 'alice@test.com',
      password: 'password123',
    });
    expect(result.userId).toBeDefined();

    const user = await db.select().from(User).where(eq(User.id, result.userId)).get();
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@test.com');
    expect(user!.name).toBe('Alice Smith');
  });

  it('hashes the password (does not store plaintext)', async () => {
    const result = await registerUser({
      name: 'Bob Jones',
      email: 'bob@test.com',
      password: 'secret123',
    });
    const user = await db.select().from(User).where(eq(User.id, result.userId)).get();
    expect(user!.passwordHash).not.toBe('secret123');
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('throws an error if the email is already in use', async () => {
    await registerUser({ name: 'First', email: 'dup@test.com', password: 'pass1' });
    await expect(
      registerUser({ name: 'Second', email: 'dup@test.com', password: 'pass2' })
    ).rejects.toThrow('already exists');
  });

  it('creates an email verification token for the new user', async () => {
    const { userId } = await registerUser({
      name: 'Carol White',
      email: 'carol@test.com',
      password: 'password123',
    });
    const token = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();
    expect(token).not.toBeNull();
    expect(token!.usedAt).toBeNull();
    expect(token!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('leaves the new user unverified (emailVerifiedAt is null)', async () => {
    const { userId } = await registerUser({
      name: 'Dan Brown',
      email: 'dan@test.com',
      password: 'password123',
    });
    const user = await db.select().from(User).where(eq(User.id, userId)).get();
    expect(user!.emailVerifiedAt).toBeNull();
  });
});

describe('resendVerificationEmail', () => {
  it('creates a new verification token for an unverified user', async () => {
    const { userId } = await registerUser({
      name: 'Eve Green',
      email: 'eve@test.com',
      password: 'password123',
    });

    // Mark the original token as used to simulate an expired/used token
    await db
      .update(EmailVerificationToken)
      .set({ usedAt: new Date() })
      .where(eq(EmailVerificationToken.userId, userId));

    await resendVerificationEmail('eve@test.com');

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .all();
    const activeToken = tokens.find(t => t.usedAt === null);
    expect(activeToken).toBeDefined();
  });

  it('invalidates the previous pending token when resending', async () => {
    const { userId } = await registerUser({
      name: 'Frank Black',
      email: 'frank@test.com',
      password: 'password123',
    });

    await resendVerificationEmail('frank@test.com');

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .all();
    // Only the newest token should be active (usedAt = null)
    const activeTokens = tokens.filter(t => t.usedAt === null);
    expect(activeTokens).toHaveLength(1);
  });

  it('does nothing silently for an unknown email', async () => {
    await expect(
      resendVerificationEmail('nobody@test.com')
    ).resolves.toBeUndefined();
  });

  it('does nothing silently for an already-verified user', async () => {
    const user = await createUser();
    await db
      .update(User)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(User.id, user!.id));

    await expect(
      resendVerificationEmail(user!.email)
    ).resolves.toBeUndefined();

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, user!.id))
      .all();
    expect(tokens).toHaveLength(0);
  });
});

describe('verifyEmailToken', () => {
  it('returns the userId and marks user as verified on a valid token', async () => {
    const { userId } = await registerUser({
      name: 'Verify User',
      email: 'verify-valid@test.com',
      password: 'password123',
    });
    const tokenRow = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();

    const result = await verifyEmailToken(tokenRow!.token);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(userId);

    const user = await db.select().from(User).where(eq(User.id, userId)).get();
    expect(user!.emailVerifiedAt).not.toBeNull();

    const updatedToken = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.id, tokenRow!.id))
      .get();
    expect(updatedToken!.usedAt).not.toBeNull();
  });

  it('returns null for a token that does not exist', async () => {
    const result = await verifyEmailToken('nonexistent-token');
    expect(result).toBeNull();
  });

  it('returns null for a token that has already been used', async () => {
    const { userId } = await registerUser({
      name: 'Used Token User',
      email: 'verify-used@test.com',
      password: 'password123',
    });
    const tokenRow = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();

    await verifyEmailToken(tokenRow!.token);
    const result = await verifyEmailToken(tokenRow!.token);
    expect(result).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const { userId } = await registerUser({
      name: 'Expired Token User',
      email: 'verify-expired@test.com',
      password: 'password123',
    });
    const tokenRow = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();

    // Backdate the expiry
    await db
      .update(EmailVerificationToken)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(EmailVerificationToken.id, tokenRow!.id));

    const result = await verifyEmailToken(tokenRow!.token);
    expect(result).toBeNull();
  });
});

describe('verifyEmailChangeToken', () => {
  async function insertChangeToken(userId: string, newEmail: string, overrides: { usedAt?: Date; expiresAt?: Date } = {}) {
    const token = crypto.randomUUID();
    await db.insert(EmailChangeToken).values({
      id: crypto.randomUUID(),
      userId,
      token,
      newEmail,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides.usedAt,
    });
    return token;
  }

  it('updates the user email and marks the token used on success', async () => {
    const user = await createUser({ email: 'old-email@test.com' });
    const token = await insertChangeToken(user!.id, 'new-email@test.com');

    const result = await verifyEmailChangeToken(token);

    expect(result).toEqual({ type: 'success', newEmail: 'new-email@test.com' });
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.email).toBe('new-email@test.com');
    const tokenRow = await db.select().from(EmailChangeToken).where(eq(EmailChangeToken.token, token)).get();
    expect(tokenRow!.usedAt).not.toBeNull();
  });

  it('returns invalid for a nonexistent token', async () => {
    const result = await verifyEmailChangeToken('nonexistent-token');
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns invalid for an expired token', async () => {
    const user = await createUser({ email: 'expired-change@test.com' });
    const token = await insertChangeToken(user!.id, 'expired-new@test.com', {
      expiresAt: new Date(Date.now() - 1000),
    });
    const result = await verifyEmailChangeToken(token);
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns invalid for an already-used token', async () => {
    const user = await createUser({ email: 'used-change@test.com' });
    const token = await insertChangeToken(user!.id, 'used-new@test.com', {
      usedAt: new Date(),
    });
    const result = await verifyEmailChangeToken(token);
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns conflict and marks token used when the new email is already taken', async () => {
    const user = await createUser({ email: 'changer@test.com' });
    await createUser({ email: 'already-taken@test.com' });
    const token = await insertChangeToken(user!.id, 'already-taken@test.com');

    const result = await verifyEmailChangeToken(token);

    expect(result).toEqual({ type: 'conflict' });
    const unchanged = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(unchanged!.email).toBe('changer@test.com');
    const tokenRow = await db.select().from(EmailChangeToken).where(eq(EmailChangeToken.token, token)).get();
    expect(tokenRow!.usedAt).not.toBeNull();
  });
});

describe('validatePasswordResetToken', () => {
  async function insertResetToken(userId: string, overrides: { usedAt?: Date; expiresAt?: Date } = {}) {
    const token = crypto.randomUUID();
    await db.insert(PasswordResetToken).values({
      id: crypto.randomUUID(),
      userId,
      token,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides.usedAt,
    });
    return token;
  }

  it('returns true for a valid unused unexpired token', async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id);
    expect(await validatePasswordResetToken(token)).toBe(true);
  });

  it('returns false for a nonexistent token', async () => {
    expect(await validatePasswordResetToken('nonexistent-token')).toBe(false);
  });

  it('returns false for an expired token', async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await validatePasswordResetToken(token)).toBe(false);
  });

  it('returns false for an already-used token', async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { usedAt: new Date() });
    expect(await validatePasswordResetToken(token)).toBe(false);
  });
});

describe('resetPassword', () => {
  async function insertResetToken(userId: string, overrides: { usedAt?: Date; expiresAt?: Date } = {}) {
    const token = crypto.randomUUID();
    await db.insert(PasswordResetToken).values({
      id: crypto.randomUUID(),
      userId,
      token,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides.usedAt,
    });
    return token;
  }

  it('updates the password hash and marks the token used on success', async () => {
    const user = await createUser({ password: 'old-password' });
    const token = await insertResetToken(user!.id);

    const result = await resetPassword(token, 'new-password-123');

    expect(result).toEqual({ type: 'success' });
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.passwordHash).not.toBe(user!.passwordHash);
    const tokenRow = await db.select().from(PasswordResetToken).where(eq(PasswordResetToken.token, token)).get();
    expect(tokenRow!.usedAt).not.toBeNull();
  });

  it('returns error for a password shorter than 6 characters', async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id);
    const result = await resetPassword(token, 'abc');
    expect(result).toEqual({ type: 'error', message: 'Password must be at least 6 characters.' });
  });

  it('returns invalid for a nonexistent token', async () => {
    const result = await resetPassword('nonexistent-token', 'validpassword123');
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns invalid for an expired token', async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { expiresAt: new Date(Date.now() - 1000) });
    const result = await resetPassword(token, 'validpassword123');
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns invalid for an already-used token', async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { usedAt: new Date() });
    const result = await resetPassword(token, 'validpassword123');
    expect(result).toEqual({ type: 'invalid' });
  });
});

describe('updateName', () => {
  it('updates the user name in the DB', async () => {
    const user = await createUser({ name: 'Old Name' });
    await updateName(user!.id, 'New Name');
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.name).toBe('New Name');
  });

  it('returns a redirect result on success', async () => {
    const user = await createUser();
    const result = await updateName(user!.id, 'Updated Name');
    expect(result).toEqual({ type: 'redirect', url: '/profile' });
  });

  it('returns an error result for an empty name', async () => {
    const user = await createUser();
    const result = await updateName(user!.id, '');
    expect(result.type).toBe('error');
  });

  it('returns an error result for whitespace-only name', async () => {
    const user = await createUser();
    const result = await updateName(user!.id, '   ');
    expect(result.type).toBe('error');
  });
});

describe('updatePhone', () => {
  it('updates the phone number in the DB', async () => {
    const user = await createUser();
    await updatePhone(user!.id, '555-123-4567');
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.phone).toBe('555-123-4567');
  });

  it('clears the phone number when empty string is provided', async () => {
    const user = await createUser();
    await updatePhone(user!.id, '555-123-4567');
    await updatePhone(user!.id, '');
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.phone).toBeNull();
  });

  it('returns an error for invalid phone format', async () => {
    const user = await createUser();
    const result = await updatePhone(user!.id, '5551234567');
    expect(result.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toMatch(/333-333-3333/);
  });

  it('returns a redirect result on success', async () => {
    const user = await createUser();
    const result = await updatePhone(user!.id, '555-987-6543');
    expect(result).toEqual({ type: 'redirect', url: '/profile' });
  });
});

describe('deleteAccount', () => {
  it('blocks site admins from deleting their own account', async () => {
    const admin = await createUser({ role: 'admin' });
    const result = await deleteAccount(admin!.id, 'admin', 'test123');
    expect(result.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toMatch(/administrator/i);
  });

  it('returns an error when no password is provided', async () => {
    const user = await createUser();
    const result = await deleteAccount(user!.id, 'user', undefined);
    expect(result.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toMatch(/password/i);
  });

  it('returns an error for an incorrect password', async () => {
    const user = await createUser({ password: 'correct-password' });
    const result = await deleteAccount(user!.id, 'user', 'wrong-password');
    expect(result.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toMatch(/incorrect password/i);
  });

  it('deletes the user and their memberships on success', async () => {
    const user = await createUser({ password: 'my-password' });
    const adminUser = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(adminUser!.id);
    const membership = await createMembership(ensemble!.id, user!.id);
    const part = await createPart(ensemble!.id, { name: 'Tenor' });
    await createMemberPart(membership!.id, part!.id);

    const result = await deleteAccount(user!.id, 'user', 'my-password');
    expect(result.type).toBe('redirect');

    const deletedUser = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(deletedUser).toBeUndefined();

    const memberships = await db
      .select()
      .from(EnsembleMember)
      .where(eq(EnsembleMember.userId, user!.id))
      .all();
    expect(memberships).toHaveLength(0);

    const memberParts = await db
      .select()
      .from(MemberPart)
      .where(eq(MemberPart.membershipId, membership!.id))
      .all();
    expect(memberParts).toHaveLength(0);
  });
});

describe('updateParts', () => {
  it('inserts MemberPart rows for each provided partId', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);
    const part1 = await createPart(ensemble!.id, { name: 'Soprano' });
    const part2 = await createPart(ensemble!.id, { name: 'Piano' });

    await updateParts(membership!.id, [part1!.id, part2!.id]);

    const rows = await db.select().from(MemberPart).where(eq(MemberPart.membershipId, membership!.id)).all();
    expect(rows).toHaveLength(2);
  });

  it('replaces existing parts when called again', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);
    const part1 = await createPart(ensemble!.id, { name: 'Soprano' });
    const part2 = await createPart(ensemble!.id, { name: 'Alto' });

    await updateParts(membership!.id, [part1!.id]);
    await updateParts(membership!.id, [part2!.id]);

    const rows = await db.select().from(MemberPart).where(eq(MemberPart.membershipId, membership!.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].partId).toBe(part2!.id);
  });

  it('removes all parts when called with an empty array', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);
    const part = await createPart(ensemble!.id, { name: 'Bass' });

    await updateParts(membership!.id, [part!.id]);
    await updateParts(membership!.id, []);

    const rows = await db.select().from(MemberPart).where(eq(MemberPart.membershipId, membership!.id)).all();
    expect(rows).toHaveLength(0);
  });

  it('returns a redirect result on success', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);

    const result = await updateParts(membership!.id, []);
    expect(result).toEqual({ type: 'redirect', url: '/profile' });
  });
});
