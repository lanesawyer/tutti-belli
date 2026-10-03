import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { db, eq, and, EnsembleMember, GroupMembership, User } from '@db';
import {
  resolveViewAs,
  isTestEmail,
  setUpRolePreview,
  SANDBOX_ENSEMBLE_ID,
  SANDBOX_GROUP_ID,
  TEST_ACCOUNTS,
} from '../../src/lib/role-preview.ts';
import { createSession, createViewAsToken, getUserFromSession, readViewAsToken } from '../../src/lib/session.ts';
import { createUser } from './fixtures.ts';

const [ensembleAdmin, groupMember, member, pending, nonMember] = TEST_ACCOUNTS;

async function membershipOf(userId: string) {
  return db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, SANDBOX_ENSEMBLE_ID), eq(EnsembleMember.userId, userId)))
    .get();
}

async function inGroup(userId: string) {
  const row = await db
    .select()
    .from(GroupMembership)
    .where(and(eq(GroupMembership.groupId, SANDBOX_GROUP_ID), eq(GroupMembership.userId, userId)))
    .get();
  return Boolean(row);
}

describe('setUpRolePreview', () => {
  it('creates one test account per role in the sandbox ensemble, and is safe to run again', async () => {
    const admin = await createUser({ role: 'admin' });
    await setUpRolePreview(admin!.id);
    await setUpRolePreview(admin!.id);

    expect(await membershipOf(ensembleAdmin.id)).toMatchObject({ role: 'admin', status: 'active' });
    expect(await membershipOf(groupMember.id)).toMatchObject({ role: 'member', status: 'active' });
    expect(await membershipOf(member.id)).toMatchObject({ role: 'member', status: 'active' });
    expect(await membershipOf(pending.id)).toMatchObject({ role: 'member', status: 'pending' });
    expect(await membershipOf(nonMember.id)).toBeUndefined();
    expect(await inGroup(groupMember.id)).toBe(true);
    expect(await inGroup(member.id)).toBe(false);

    const sandboxMembers = await db
      .select()
      .from(EnsembleMember)
      .where(eq(EnsembleMember.ensembleId, SANDBOX_ENSEMBLE_ID))
      .all();
    expect(sandboxMembers).toHaveLength(4);
  });

  it('puts test accounts back in their roles', async () => {
    const admin = await createUser({ role: 'admin' });
    await setUpRolePreview(admin!.id);
    await db.update(EnsembleMember).set({ status: 'active' }).where(eq(EnsembleMember.id, (await membershipOf(pending.id))!.id));

    await setUpRolePreview(admin!.id);

    expect((await membershipOf(pending.id))!.status).toBe('pending');
  });

  it('gives test accounts reserved emails that are never sent to', async () => {
    const admin = await createUser({ role: 'admin' });
    await setUpRolePreview(admin!.id);
    const users = await db.select().from(User).all();
    const testUsers = users.filter((u) => TEST_ACCOUNTS.some((a) => a.id === u.id));

    expect(testUsers).toHaveLength(TEST_ACCOUNTS.length);
    expect(testUsers.every((u) => isTestEmail(u.email))).toBe(true);
    expect(isTestEmail('someone@example.com')).toBe(false);
  });
});

describe('resolveViewAs', () => {
  it('returns the test account for the site admin who started the preview', async () => {
    const admin = await createUser({ role: 'admin' });
    await setUpRolePreview(admin!.id);

    const viewed = await resolveViewAs(createViewAsToken(admin!.id, member.id), admin!);

    expect(viewed?.id).toBe(member.id);
  });

  it('refuses real users, other admins, non-admins and expired or forged tokens', async () => {
    const admin = await createUser({ role: 'admin' });
    const otherAdmin = await createUser({ role: 'admin' });
    const regular = await createUser();
    await setUpRolePreview(admin!.id);

    expect(await resolveViewAs(createViewAsToken(admin!.id, regular!.id), admin!)).toBeNull();
    expect(await resolveViewAs(createViewAsToken(admin!.id, member.id), otherAdmin!)).toBeNull();
    expect(await resolveViewAs(createViewAsToken(regular!.id, member.id), regular!)).toBeNull();

    const expired = jwt.sign(
      { purpose: 'view-as', adminId: admin!.id, targetId: member.id, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET!,
    );
    expect(await resolveViewAs(expired, admin!)).toBeNull();

    const forged = jwt.sign({ purpose: 'view-as', adminId: admin!.id, targetId: member.id }, 'not-the-secret');
    expect(await resolveViewAs(forged, admin!)).toBeNull();
  });

  it('keeps view-as tokens and session tokens from standing in for each other', async () => {
    const admin = await createUser({ role: 'admin' });

    expect(readViewAsToken(createSession(admin!.id))).toBeNull();
    expect(await getUserFromSession(createViewAsToken(admin!.id, member.id))).toBeNull();
  });
});
