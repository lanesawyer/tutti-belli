import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerUser, updateName, updatePhone, deleteAccount } from '../../src/lib/profile.ts';
import { db, User, EnsembleMember, eq } from 'astro:db';
import { createUser, createEnsemble, createMembership } from './fixtures.ts';

// Mock email module — we don't want to call the real Resend API in tests
vi.mock('../../src/lib/email.ts', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
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
    expect(result.message).toMatch(/333-333-3333/);
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
    expect(result.message).toMatch(/administrator/i);
  });

  it('returns an error when no password is provided', async () => {
    const user = await createUser();
    const result = await deleteAccount(user!.id, 'user', undefined);
    expect(result.type).toBe('error');
    expect(result.message).toMatch(/password/i);
  });

  it('returns an error for an incorrect password', async () => {
    const user = await createUser({ password: 'correct-password' });
    const result = await deleteAccount(user!.id, 'user', 'wrong-password');
    expect(result.type).toBe('error');
    expect(result.message).toMatch(/incorrect password/i);
  });

  it('deletes the user and their memberships on success', async () => {
    const user = await createUser({ password: 'my-password' });
    const adminUser = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(adminUser!.id);
    await createMembership(ensemble!.id, user!.id);

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
  });
});
