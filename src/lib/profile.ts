import {
  db,
  eq,
  and,
  gt,
  isNull,
  inArray,
  User,
  Ensemble,
  EnsembleMember,
  Part,
  MemberPart,
  Attendance,
  SeasonMembership,
  GroupMembership,
  PasswordResetToken,
  EmailChangeToken,
  EmailVerificationToken,
  TaskCompletion,
} from 'astro:db';
import { fileToDataUri, validateImageFile } from './upload';
import { hashPassword, verifyPassword } from './auth';
import { sendEmailChangeVerificationEmail, sendEmailVerificationEmail } from './email';

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const { name, email, password } = params;

  const existing = await db.select({ id: User.id }).from(User).where(eq(User.email, email)).get();
  if (existing) throw new Error('An account with this email already exists.');

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.insert(User).values({ id: userId, email, passwordHash, name, role: 'user' });

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(EmailVerificationToken).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt,
  });

  // Fire-and-forget: don't block registration if email fails
  sendEmailVerificationEmail(email, name, token).catch(() => {});

  return { userId };
}

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

  // Invalidate any existing pending email change for this user
  const now = new Date();
  await db
    .update(EmailChangeToken)
    .set({ usedAt: now })
    .where(
      and(
        eq(EmailChangeToken.userId, userId),
        isNull(EmailChangeToken.usedAt),
        gt(EmailChangeToken.expiresAt, now),
      )
    );

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(EmailChangeToken).values({
    id: crypto.randomUUID(),
    userId,
    token,
    newEmail: trimmedEmail,
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

export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await db.select().from(User).where(eq(User.email, email)).get();
  if (!user || user.emailVerifiedAt) return; // silent: prevent enumeration

  // Invalidate any existing pending tokens
  const now = new Date();
  await db
    .update(EmailVerificationToken)
    .set({ usedAt: now })
    .where(and(eq(EmailVerificationToken.userId, user.id), isNull(EmailVerificationToken.usedAt)));

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(EmailVerificationToken).values({
    id: crypto.randomUUID(),
    userId: user.id,
    token,
    expiresAt,
  });

  sendEmailVerificationEmail(email, user.name, token).catch(() => {});
}

export type VerifyEmailChangeResult =
  | { type: 'success'; newEmail: string }
  | { type: 'conflict' }
  | { type: 'invalid' };

export async function verifyEmailChangeToken(token: string): Promise<VerifyEmailChangeResult> {
  const now = new Date();
  const [record] = await db
    .select()
    .from(EmailChangeToken)
    .where(
      and(
        eq(EmailChangeToken.token, token),
        gt(EmailChangeToken.expiresAt, now),
        isNull(EmailChangeToken.usedAt),
      ),
    );

  if (!record) return { type: 'invalid' };

  const [conflict] = await db.select({ id: User.id }).from(User).where(eq(User.email, record.newEmail));

  if (conflict) {
    await db.update(EmailChangeToken).set({ usedAt: now }).where(eq(EmailChangeToken.id, record.id));
    return { type: 'conflict' };
  }

  await db.update(User).set({ email: record.newEmail }).where(eq(User.id, record.userId));
  await db.update(EmailChangeToken).set({ usedAt: now }).where(eq(EmailChangeToken.id, record.id));

  return { type: 'success', newEmail: record.newEmail };
}

export async function verifyEmailToken(token: string): Promise<{ userId: string } | null> {
  const now = new Date();
  const record = await db
    .select()
    .from(EmailVerificationToken)
    .where(
      and(
        eq(EmailVerificationToken.token, token),
        gt(EmailVerificationToken.expiresAt, now),
        isNull(EmailVerificationToken.usedAt),
      ),
    )
    .get();

  if (!record) return null;

  await db.update(User).set({ emailVerifiedAt: now }).where(eq(User.id, record.userId));
  await db.update(EmailVerificationToken).set({ usedAt: now }).where(eq(EmailVerificationToken.id, record.id));

  return { userId: record.userId };
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
  await db.delete(EmailVerificationToken).where(eq(EmailVerificationToken.userId, userId));
  await db.delete(EmailChangeToken).where(eq(EmailChangeToken.userId, userId));
  await db.delete(PasswordResetToken).where(eq(PasswordResetToken.userId, userId));
  await db.delete(Attendance).where(eq(Attendance.userId, userId));
  await db.delete(SeasonMembership).where(eq(SeasonMembership.userId, userId));
  await db.delete(TaskCompletion).where(eq(TaskCompletion.userId, userId));
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
