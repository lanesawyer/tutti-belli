import { db, eq, and, Ensemble, EnsembleMember, Group, GroupMembership, User } from '@db';
import { hashPassword } from './auth';
import { isSiteAdmin } from './permissions';
import { readViewAsToken } from './session';
import { findUniqueSlug } from './slug';

/**
 * Role preview lets a site admin see the site as each kind of user. The test accounts only
 * belong to one sandbox ensemble, so nothing else needs to filter them out. Their emails use a
 * reserved domain and are never sent; their passwords are random, so nobody can sign in as them.
 */
export const SANDBOX_ENSEMBLE_ID = '7e57e57e-0000-4000-8000-000000000000';
export const SANDBOX_GROUP_ID = '7e57e57e-0000-4000-8000-000000000001';
export const TEST_EMAIL_DOMAIN = 'role-preview.invalid';
export const VIEW_AS_COOKIE = 'view_as';

export interface TestAccount {
  id: string;
  name: string;
  description: string;
  membership: { role: 'admin' | 'member'; status: 'active' | 'pending'; inGroup: boolean } | null;
}

export const TEST_ACCOUNTS: TestAccount[] = [
  {
    id: '7e57e57e-0000-4000-8000-000000000010',
    name: 'Test Ensemble Admin',
    description: 'ensemble admin',
    membership: { role: 'admin', status: 'active', inGroup: false },
  },
  {
    id: '7e57e57e-0000-4000-8000-000000000011',
    name: 'Test Group Member',
    description: 'member of the Test Group',
    membership: { role: 'member', status: 'active', inGroup: true },
  },
  {
    id: '7e57e57e-0000-4000-8000-000000000012',
    name: 'Test Member',
    description: 'regular member',
    membership: { role: 'member', status: 'active', inGroup: false },
  },
  {
    id: '7e57e57e-0000-4000-8000-000000000013',
    name: 'Test Pending Member',
    description: 'member waiting for approval',
    membership: { role: 'member', status: 'pending', inGroup: false },
  },
  {
    id: '7e57e57e-0000-4000-8000-000000000014',
    name: 'Test Non-member',
    description: 'signed in, not in the ensemble',
    membership: null,
  },
];

export function getTestAccount(userId: string): TestAccount | null {
  return TEST_ACCOUNTS.find((account) => account.id === userId) ?? null;
}

export function isTestEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);
}

export async function getSandboxEnsemble() {
  return (await db.select().from(Ensemble).where(eq(Ensemble.id, SANDBOX_ENSEMBLE_ID)).get()) ?? null;
}

/**
 * Creates the sandbox ensemble, its group and the test accounts, or puts them back the way they
 * started if they already exist. Content added to the sandbox is left alone.
 */
export async function setUpRolePreview(createdBy: string): Promise<void> {
  if (!(await getSandboxEnsemble())) {
    await db.insert(Ensemble).values({
      id: SANDBOX_ENSEMBLE_ID,
      name: 'Role Preview Sandbox',
      slug: await findUniqueSlug('role-preview', SANDBOX_ENSEMBLE_ID),
      description: 'Test accounts for previewing the site as each role. Only site admins and the test accounts are in it.',
      createdBy,
    });
  }

  const group = await db.select({ id: Group.id }).from(Group).where(eq(Group.id, SANDBOX_GROUP_ID)).get();
  if (!group) {
    await db.insert(Group).values({ id: SANDBOX_GROUP_ID, ensembleId: SANDBOX_ENSEMBLE_ID, name: 'Test Group' });
  }

  for (const account of TEST_ACCOUNTS) {
    const user = await db.select({ id: User.id }).from(User).where(eq(User.id, account.id)).get();
    if (!user) {
      await db.insert(User).values({
        id: account.id,
        email: `${account.id}@${TEST_EMAIL_DOMAIN}`,
        passwordHash: await hashPassword(crypto.randomUUID()),
        name: account.name,
        emailVerifiedAt: new Date(),
      });
    }

    const membership = await db
      .select({ id: EnsembleMember.id })
      .from(EnsembleMember)
      .where(and(eq(EnsembleMember.ensembleId, SANDBOX_ENSEMBLE_ID), eq(EnsembleMember.userId, account.id)))
      .get();
    if (account.membership && membership) {
      await db
        .update(EnsembleMember)
        .set({ role: account.membership.role, status: account.membership.status })
        .where(eq(EnsembleMember.id, membership.id));
    } else if (account.membership) {
      await db.insert(EnsembleMember).values({
        id: crypto.randomUUID(),
        ensembleId: SANDBOX_ENSEMBLE_ID,
        userId: account.id,
        role: account.membership.role,
        status: account.membership.status,
      });
    } else if (membership) {
      await db.delete(EnsembleMember).where(eq(EnsembleMember.id, membership.id));
    }

    const groupMembership = await db
      .select({ id: GroupMembership.id })
      .from(GroupMembership)
      .where(and(eq(GroupMembership.groupId, SANDBOX_GROUP_ID), eq(GroupMembership.userId, account.id)))
      .get();
    if (account.membership?.inGroup && !groupMembership) {
      await db.insert(GroupMembership).values({ id: crypto.randomUUID(), groupId: SANDBOX_GROUP_ID, userId: account.id });
    } else if (!account.membership?.inGroup && groupMembership) {
      await db.delete(GroupMembership).where(eq(GroupMembership.id, groupMembership.id));
    }
  }
}

/**
 * The test account a view-as cookie points at, if the cookie is valid for this signed-in site
 * admin. Anything else (expired, forged, another admin's cookie, a real user) returns null.
 */
export async function resolveViewAs(token: string, realUser: { id: string; role: string }) {
  const payload = readViewAsToken(token);
  if (!payload || payload.adminId !== realUser.id || !isSiteAdmin(realUser)) return null;
  if (!getTestAccount(payload.targetId)) return null;
  return (await db.select().from(User).where(eq(User.id, payload.targetId)).get()) ?? null;
}
