import { describe, it, expect, vi } from 'vitest';
import { registerUser, resendVerificationEmail, updateName, updatePhone, deleteAccount, updateParts } from '../../src/lib/profile.ts';
import { db, User, EnsembleMember, MemberPart, EmailVerificationToken, eq } from 'astro:db';
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
