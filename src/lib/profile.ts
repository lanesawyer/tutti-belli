import {
  db,
  eq,
  User,
  Ensemble,
  EnsembleMember,
  Part,
  Attendance,
  SeasonMembership,
  GroupMembership,
  PasswordResetToken,
} from 'astro:db';
import { fileToDataUri, validateImageFile } from './upload';
import { verifyPassword } from './auth';

export type ActionResult =
  | { type: 'redirect'; url: string }
  | { type: 'error'; message: string };

export async function getMembershipsWithParts(userId: string) {
  const memberships = await db
    .select({
      ensembleId: Ensemble.id,
      ensembleName: Ensemble.name,
      membershipId: EnsembleMember.id,
      partId: EnsembleMember.partId,
    })
    .from(EnsembleMember)
    .innerJoin(Ensemble, eq(EnsembleMember.ensembleId, Ensemble.id))
    .where(eq(EnsembleMember.userId, userId))
    .all();

  const ensembleIds = memberships.map((m) => m.ensembleId);
  const allParts =
    ensembleIds.length > 0 ? await db.select().from(Part).all() : [];

  const partsByEnsemble = new Map<string, (typeof allParts)[number][]>();
  for (const part of allParts) {
    if (ensembleIds.includes(part.ensembleId)) {
      if (!partsByEnsemble.has(part.ensembleId)) {
        partsByEnsemble.set(part.ensembleId, []);
      }
      partsByEnsemble.get(part.ensembleId)!.push(part);
    }
  }
  for (const parts of partsByEnsemble.values()) {
    parts.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { memberships, partsByEnsemble };
}

export async function updateName(
  userId: string,
  name: string | undefined
): Promise<ActionResult> {
  if (!name?.trim()) {
    return { type: 'error', message: 'Name cannot be empty' };
  }
  await db.update(User).set({ name: name.trim() }).where(eq(User.id, userId));
  return { type: 'redirect', url: '/profile' };
}

export async function updateAvatar(
  userId: string,
  currentAvatarUrl: string | null | undefined,
  avatarFile: File,
  removeAvatar: boolean
): Promise<ActionResult> {
  let avatarUrl = currentAvatarUrl ?? null;

  if (removeAvatar && avatarUrl) {
    avatarUrl = null;
  }

  if (avatarFile && avatarFile.size > 0) {
    const validation = validateImageFile(avatarFile, 2);
    if (!validation.valid) {
      return { type: 'error', message: validation.error! };
    }
    avatarUrl = await fileToDataUri(avatarFile);
  }

  await db.update(User).set({ avatarUrl }).where(eq(User.id, userId));
  return { type: 'redirect', url: '/profile' };
}

export async function updatePart(
  membershipId: string | undefined,
  partId: string | undefined
): Promise<ActionResult | null> {
  if (!membershipId) return null;
  await db
    .update(EnsembleMember)
    .set({ partId: partId || null })
    .where(eq(EnsembleMember.id, membershipId));
  return { type: 'redirect', url: '/profile' };
}

async function deleteUserData(userId: string): Promise<void> {
  await db.delete(PasswordResetToken).where(eq(PasswordResetToken.userId, userId));
  await db.delete(Attendance).where(eq(Attendance.userId, userId));
  await db.delete(SeasonMembership).where(eq(SeasonMembership.userId, userId));
  await db.delete(GroupMembership).where(eq(GroupMembership.userId, userId));
  await db.delete(EnsembleMember).where(eq(EnsembleMember.userId, userId));
  await db.delete(User).where(eq(User.id, userId));
}

// Self-service account deletion: requires password, blocks admins from deleting themselves.
export async function deleteAccount(
  userId: string,
  role: string,
  password: string | undefined
): Promise<ActionResult> {
  if (role === 'admin') {
    return {
      type: 'error',
      message: 'Site administrators cannot delete their own account. Transfer admin rights first.',
    };
  }
  if (!password) {
    return { type: 'error', message: 'Password is required to delete your account.' };
  }

  const fullUser = await db.select().from(User).where(eq(User.id, userId)).get();
  const valid = fullUser ? await verifyPassword(password, fullUser.passwordHash) : false;
  if (!valid) {
    return { type: 'error', message: 'Incorrect password. Account not deleted.' };
  }

  await deleteUserData(userId);
  return { type: 'redirect', url: '/' };
}

// Admin-initiated deletion: no password required, can delete any non-self user.
export async function adminDeleteUser(userId: string): Promise<void> {
  await deleteUserData(userId);
}
