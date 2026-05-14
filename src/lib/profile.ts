import {
  db,
  eq,
  and,
  inArray,
  User,
  Account,
  Ensemble,
  EnsembleMember,
  Part,
  MemberPart,
  Attendance,
  SeasonMembership,
  GroupMembership,
  TaskCompletion,
} from 'astro:db';
import { fileToDataUri, validateImageFile } from './upload';
import { verifyPassword } from './bcrypt';
import { sendEmailChangeVerificationEmail } from './email';
import { auth } from './auth';

export type ActionResult =
  | { type: 'redirect'; url: string }
  | { type: 'error'; message: string };

export async function getMembershipsWithParts(userId: string) {
  const memberships = await db
    .select({
      ensembleId: Ensemble.id,
      ensembleName: Ensemble.name,
      membershipId: EnsembleMember.id,
    })
    .from(EnsembleMember)
    .innerJoin(Ensemble, eq(EnsembleMember.ensembleId, Ensemble.id))
    .where(eq(EnsembleMember.userId, userId))
    .all();

  const membershipIds = memberships.map((m) => m.membershipId);
  const ensembleIds = memberships.map((m) => m.ensembleId);
  const allParts =
    ensembleIds.length > 0 ? await db.select().from(Part).all() : [];

  const memberPartRows =
    membershipIds.length > 0
      ? await db.select().from(MemberPart).where(inArray(MemberPart.membershipId, membershipIds)).all()
      : [];

  const partsByMembership = new Map<string, (typeof allParts)[number][]>();
  for (const mp of memberPartRows) {
    const part = allParts.find((p) => p.id === mp.partId);
    if (!part) continue;
    if (!partsByMembership.has(mp.membershipId)) {
      partsByMembership.set(mp.membershipId, []);
    }
    partsByMembership.get(mp.membershipId)!.push(part);
  }
  for (const parts of partsByMembership.values()) {
    parts.sort((a, b) => a.sortOrder - b.sortOrder);
  }

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

  return { memberships, partsByEnsemble, partsByMembership };
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

export async function updatePhone(
  userId: string,
  phone: string | undefined
): Promise<ActionResult> {
  const trimmed = phone?.trim() || null;
  if (trimmed && !/^\d{3}-\d{3}-\d{4}$/.test(trimmed)) {
    return { type: 'error', message: 'Phone number must be in the format 333-333-3333' };
  }
  await db.update(User).set({ phone: trimmed }).where(eq(User.id, userId));
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

export async function updateParts(
  membershipId: string | undefined,
  partIds: string[]
): Promise<ActionResult | null> {
  if (!membershipId) return null;
  await db.delete(MemberPart).where(eq(MemberPart.membershipId, membershipId));
  const uniquePartIds = [...new Set(partIds)];
  if (uniquePartIds.length > 0) {
    await db.insert(MemberPart).values(
      uniquePartIds.map((partId) => ({ id: crypto.randomUUID(), membershipId, partId }))
    );
  }
  return { type: 'redirect', url: '/profile' };
}

export async function initiateEmailChange(
  userId: string,
  userName: string,
  currentEmail: string,
  newEmail: string | undefined,
): Promise<ActionResult> {
  if (!newEmail?.trim()) {
    return { type: 'error', message: 'Please enter a new email address.' };
  }

  const trimmedEmail = newEmail.trim().toLowerCase();

  if (!trimmedEmail.includes('@')) {
    return { type: 'error', message: 'Please enter a valid email address.' };
  }

  if (trimmedEmail === currentEmail.toLowerCase()) {
    return { type: 'error', message: 'That is already your current email address.' };
  }

  const [existingUser] = await db
    .select({ id: User.id })
    .from(User)
    .where(eq(User.email, trimmedEmail));
  if (existingUser) {
    return { type: 'error', message: 'That email address is already in use.' };
  }

  // Generate a verification token via Better Auth's verification table
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const { Verification } = await import('astro:db');
  await db.insert(Verification).values({
    id: crypto.randomUUID(),
    identifier: `email-change:${userId}`,
    value: JSON.stringify({ newEmail: trimmedEmail, token }),
    expiresAt,
  });

  const emailResult = await sendEmailChangeVerificationEmail(trimmedEmail, userName, token);
  if (!emailResult.success) {
    console.error('Email change verification email failed:', emailResult.error);
    if (import.meta.env.DEV) {
      return { type: 'error', message: `Email failed: ${emailResult.error}` };
    }
  }

  return { type: 'redirect', url: '/profile?emailChangePending=1' };
}

export type VerifyEmailChangeResult =
  | { type: 'success'; newEmail: string }
  | { type: 'conflict' }
  | { type: 'invalid' };

export async function verifyEmailChangeToken(token: string): Promise<VerifyEmailChangeResult> {
  const { Verification } = await import('astro:db');
  const now = new Date();

  const records = await db
    .select()
    .from(Verification)
    .all();

  // Find the record whose value contains our token
  const record = records.find(r => {
    try {
      return JSON.parse(r.value)?.token === token;
    } catch {
      return false;
    }
  });

  if (!record || record.expiresAt < now) return { type: 'invalid' };

  const { newEmail } = JSON.parse(record.value) as { newEmail: string };

  const [conflict] = await db.select({ id: User.id }).from(User).where(eq(User.email, newEmail));
  if (conflict) {
    await db.delete(Verification).where(eq(Verification.id, record.id));
    return { type: 'conflict' };
  }

  // Extract userId from identifier "email-change:<userId>"
  const userId = record.identifier.replace('email-change:', '');
  await db.update(User).set({ email: newEmail }).where(eq(User.id, userId));
  await db.delete(Verification).where(eq(Verification.id, record.id));

  return { type: 'success', newEmail };
}

async function deleteUserData(userId: string): Promise<void> {
  const memberships = await db
    .select({ id: EnsembleMember.id })
    .from(EnsembleMember)
    .where(eq(EnsembleMember.userId, userId))
    .all();
  const membershipIds = memberships.map((m) => m.id);
  if (membershipIds.length > 0) {
    await db.delete(MemberPart).where(inArray(MemberPart.membershipId, membershipIds));
  }
  await db.delete(Attendance).where(eq(Attendance.userId, userId));
  await db.delete(SeasonMembership).where(eq(SeasonMembership.userId, userId));
  await db.delete(TaskCompletion).where(eq(TaskCompletion.userId, userId));
  await db.delete(GroupMembership).where(eq(GroupMembership.userId, userId));
  await db.delete(EnsembleMember).where(eq(EnsembleMember.userId, userId));
  // Better Auth manages sessions/accounts — delete them too
  await db.delete(Account).where(eq(Account.userId, userId));
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

  // Get the hashed password from the Account table (Better Auth stores it there)
  const account = await db
    .select({ password: Account.password })
    .from(Account)
    .where(and(eq(Account.userId, userId), eq(Account.providerId, 'credential')))
    .get();

  const valid = account?.password ? await verifyPassword(password, account.password) : false;
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

// Re-export for use in auth actions
export { auth };
