import { describe, it, expect, vi } from 'vitest';
import { updateName, updatePhone, deleteAccount, updateParts, verifyEmailChangeToken, initiateEmailChange } from '../../src/lib/profile.ts';
import { db, User, Account, Verification, EnsembleMember, MemberPart, eq } from 'astro:db';
import { createUser, createEnsemble, createMembership, createPart, createMemberPart } from './fixtures.ts';

// Mock email module — we don't want to call the real Resend API in tests
vi.mock('../../src/lib/email.ts', () => ({
  sendEmailVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendAnnouncementEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Better Auth — tests run without a full auth server
vi.mock('../../src/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

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

describe('initiateEmailChange', () => {
  it('returns error for empty email', async () => {
    const user = await createUser();
    const result = await initiateEmailChange(user!.id, user!.name, user!.email, '');
    expect(result.type).toBe('error');
  });

  it('returns error when new email matches current email', async () => {
    const user = await createUser({ email: 'same@test.com' });
    const result = await initiateEmailChange(user!.id, user!.name, 'same@test.com', 'same@test.com');
    expect(result.type).toBe('error');
  });

  it('returns error when new email is already in use', async () => {
    const user = await createUser({ email: 'original@test.com' });
    await createUser({ email: 'taken@test.com' });
    const result = await initiateEmailChange(user!.id, user!.name, 'original@test.com', 'taken@test.com');
    expect(result.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toMatch(/already in use/i);
  });

  it('creates a Verification record and returns redirect on success', async () => {
    const user = await createUser({ email: 'changer@test.com' });
    const result = await initiateEmailChange(user!.id, user!.name, 'changer@test.com', 'new@test.com');
    expect(result.type).toBe('redirect');

    const records = await db
      .select()
      .from(Verification)
      .where(eq(Verification.identifier, `email-change:${user!.id}`))
      .all();
    expect(records).toHaveLength(1);
    const parsed = JSON.parse(records[0].value) as { newEmail: string; token: string };
    expect(parsed.newEmail).toBe('new@test.com');
    expect(parsed.token).toBeDefined();
  });
});

describe('verifyEmailChangeToken', () => {
  async function insertVerificationRecord(userId: string, newEmail: string, overrides: { expiresAt?: Date } = {}) {
    const token = crypto.randomUUID();
    await db.insert(Verification).values({
      id: crypto.randomUUID(),
      identifier: `email-change:${userId}`,
      value: JSON.stringify({ newEmail, token }),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    });
    return token;
  }

  it('updates the user email and removes the record on success', async () => {
    const user = await createUser({ email: 'old-email@test.com' });
    const token = await insertVerificationRecord(user!.id, 'new-email@test.com');

    const result = await verifyEmailChangeToken(token);

    expect(result).toEqual({ type: 'success', newEmail: 'new-email@test.com' });
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.email).toBe('new-email@test.com');
    const records = await db.select().from(Verification).where(eq(Verification.identifier, `email-change:${user!.id}`)).all();
    expect(records).toHaveLength(0);
  });

  it('returns invalid for a nonexistent token', async () => {
    const result = await verifyEmailChangeToken('nonexistent-token');
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns invalid for an expired token', async () => {
    const user = await createUser({ email: 'expired-change@test.com' });
    const token = await insertVerificationRecord(user!.id, 'expired-new@test.com', {
      expiresAt: new Date(Date.now() - 1000),
    });
    const result = await verifyEmailChangeToken(token);
    expect(result).toEqual({ type: 'invalid' });
  });

  it('returns conflict when the new email is already taken', async () => {
    const user = await createUser({ email: 'changer2@test.com' });
    await createUser({ email: 'already-taken@test.com' });
    const token = await insertVerificationRecord(user!.id, 'already-taken@test.com');

    const result = await verifyEmailChangeToken(token);

    expect(result).toEqual({ type: 'conflict' });
    const unchanged = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(unchanged!.email).toBe('changer2@test.com');
  });
});
