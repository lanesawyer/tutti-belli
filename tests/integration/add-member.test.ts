import { describe, it, expect } from 'vitest';
import { db, eq, and, EnsembleMember, PasswordResetToken, SeasonMembership, User } from '@db';
import { addMemberByEmail, NEW_ACCOUNT_LINK_TTL_MS } from '../../src/lib/ensemble.ts';
import { resetPassword } from '../../src/lib/profile.ts';
import { verifyPassword } from '../../src/lib/auth.ts';
import { createUser, createEnsemble, createMembership, createSeason } from './fixtures.ts';

async function membership(ensembleId: string, userId: string) {
  return db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, userId)))
    .get();
}

describe('addMemberByEmail', () => {
  it('creates an account for a new email, adds it as an active member, and returns a 7-day set-password token', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id, { isActive: 1 });

    const result = await addMemberByEmail(ensemble!.id, { name: ' New Singer ', email: ' New.Singer@Example.com ', role: 'member' });

    expect(result.type).toBe('created');
    if (result.type !== 'created') return;
    const user = await db.select().from(User).where(eq(User.id, result.userId)).get();
    expect(user).toMatchObject({ email: 'new.singer@example.com', name: 'New Singer', role: 'user', emailVerifiedAt: null });
    expect(await membership(ensemble!.id, result.userId)).toMatchObject({ role: 'member', status: 'active' });
    const inSeason = await db
      .select()
      .from(SeasonMembership)
      .where(and(eq(SeasonMembership.seasonId, season!.id), eq(SeasonMembership.userId, result.userId)))
      .get();
    expect(inSeason).toBeDefined();

    const token = await db.select().from(PasswordResetToken).where(eq(PasswordResetToken.token, result.setPasswordToken)).get();
    const ttl = token!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(NEW_ACCOUNT_LINK_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(NEW_ACCOUNT_LINK_TTL_MS);
  });

  it('lets the new person set a password, which also verifies their email', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const result = await addMemberByEmail(ensemble!.id, { name: 'Alto', email: 'alto@example.com', role: 'member' });
    if (result.type !== 'created') throw new Error('expected a new account');

    expect(await resetPassword(result.setPasswordToken, 'a-good-password')).toEqual({ type: 'success' });

    const user = await db.select().from(User).where(eq(User.id, result.userId)).get();
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyPassword('a-good-password', user!.passwordHash)).toBe(true);
  });

  it('adds an existing account, matching the email case-insensitively, with the chosen role', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const existing = await createUser({ email: 'Tenor@Example.com', name: 'Tenor' });
    const usersBefore = (await db.select().from(User).all()).length;

    const result = await addMemberByEmail(ensemble!.id, { name: '', email: 'tenor@example.com', role: 'admin' });

    expect(result).toEqual({ type: 'added', userId: existing!.id, name: 'Tenor' });
    expect((await db.select().from(User).all()).length).toBe(usersBefore);
    expect(await membership(ensemble!.id, existing!.id)).toMatchObject({ role: 'admin', status: 'active' });
  });

  it('approves someone whose join request was pending', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const pending = await createUser({ email: 'pending@example.com' });
    await createMembership(ensemble!.id, pending!.id, { status: 'pending' });

    const result = await addMemberByEmail(ensemble!.id, { name: '', email: 'pending@example.com', role: 'member' });

    expect(result.type).toBe('added');
    const rows = await db.select().from(EnsembleMember).where(eq(EnsembleMember.userId, pending!.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
  });

  it('refuses someone already in the ensemble, and a new email without a name', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const member = await createUser({ email: 'member@example.com', name: 'Member' });
    await createMembership(ensemble!.id, member!.id);

    expect(await addMemberByEmail(ensemble!.id, { name: '', email: 'member@example.com', role: 'member' })).toEqual({
      type: 'error',
      message: 'Member is already a member of this ensemble.',
    });
    expect((await addMemberByEmail(ensemble!.id, { name: ' ', email: 'nobody@example.com', role: 'member' })).type).toBe('error');
    expect(await db.select().from(User).where(eq(User.email, 'nobody@example.com')).get()).toBeUndefined();
  });
});
