import { db, eq, or, and, ne, inArray, sql, Ensemble, EnsembleMember, EnsembleInvite, EnsembleLink, Group, GroupMembership, MemberPart, Part, Season, SeasonMembership, User } from '@db';
import { canManageEnsemble, isSiteAdmin } from './permissions';
import { deleteImage } from './storage';
import { createPasswordResetToken, hashPassword } from './auth';

/**
 * Look up an ensemble by either its slug or its UUID id.
 */
export async function getEnsembleBySlugOrId(slugOrId: string) {
  const ensemble = await db.select().from(Ensemble)
    .where(or(eq(Ensemble.slug, slugOrId), eq(Ensemble.id, slugOrId)))
    .get();
  return ensemble ?? null;
}

/**
 * Fetch the EnsembleMember record for a given user in a given ensemble, or null if not a member.
 */
export async function getEnsembleMembership(ensembleId: string, userId: string) {
  return await db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, userId)))
    .get() ?? null;
}

/**
 * Fetch membership and derive isAdmin for a user in an ensemble.
 * Returns null if the user has no access (not a member and not a site admin).
 */
export async function getEnsembleAccess(
  user: { id: string; role: string },
  ensembleId: string,
) {
  const membership = await getEnsembleMembership(ensembleId, user.id);
  if (!membership && !isSiteAdmin(user)) return null;
  const isAdmin = canManageEnsemble(user, membership);
  return { membership, isAdmin };
}

/**
 * Look up an invite by code (case-insensitive). Returns null if not found.
 */
export async function getInviteByCode(code: string) {
  return await db
    .select()
    .from(EnsembleInvite)
    .where(eq(EnsembleInvite.code, code.toUpperCase()))
    .get() ?? null;
}

/**
 * Look up the ensemble associated with an invite code. Returns null if the code is invalid.
 */
export async function getEnsembleByInviteCode(code: string) {
  const invite = await getInviteByCode(code);
  if (!invite) return null;
  return await db
    .select()
    .from(Ensemble)
    .where(eq(Ensemble.id, invite.ensembleId))
    .get() ?? null;
}

/**
 * Get all links for an ensemble, ordered by sortOrder then createdAt.
 */
export async function getEnsembleLinks(ensembleId: string) {
  return await db
    .select()
    .from(EnsembleLink)
    .where(eq(EnsembleLink.ensembleId, ensembleId))
    .orderBy(EnsembleLink.sortOrder, EnsembleLink.createdAt)
    .all();
}

/**
 * Check if a slug is taken by another ensemble. Returns true if taken.
 */
export async function isSlugTaken(slug: string, excludeId: string): Promise<boolean> {
  const conflict = await db
    .select({ id: Ensemble.id })
    .from(Ensemble)
    .where(and(eq(Ensemble.slug, slug), ne(Ensemble.id, excludeId)))
    .get();
  return !!conflict;
}

/**
 * Update ensemble fields.
 */
export async function updateEnsemble(
  ensembleId: string,
  data: {
    name: string;
    slug: string | null;
    description: string | null;
    discordLink: string | null;
    discordWebhookUrl: string | null;
    codeOfConduct: string | null;
    imageUrl?: string | null;
    checkInStartMinutes: number;
    checkInEndMinutes: number;
    timezone?: string;
  },
) {
  const before = await db.select({ imageUrl: Ensemble.imageUrl }).from(Ensemble).where(eq(Ensemble.id, ensembleId)).get();
  await db.update(Ensemble).set(data).where(eq(Ensemble.id, ensembleId));
  if (data.imageUrl !== undefined && before?.imageUrl !== data.imageUrl) await deleteImage(before?.imageUrl);
}

/**
 * Add a link to an ensemble.
 */
export async function addEnsembleLink(
  ensembleId: string,
  label: string,
  url: string,
  sortOrder: number,
) {
  await db.insert(EnsembleLink).values({
    id: crypto.randomUUID(),
    ensembleId,
    label,
    url,
    sortOrder,
  });
}

/**
 * Delete a link from an ensemble (scoped to ensemble for safety).
 */
export async function deleteEnsembleLink(linkId: string, ensembleId: string) {
  await db
    .delete(EnsembleLink)
    .where(and(eq(EnsembleLink.id, linkId), eq(EnsembleLink.ensembleId, ensembleId)));
}

/**
 * Get all active members (with user info and membership details) for an ensemble.
 */
export async function getEnsembleMembersWithUsers(ensembleId: string) {
  return await db
    .select({
      id: User.id,
      name: User.name,
      email: User.email,
      avatarUrl: User.avatarUrl,
      role: EnsembleMember.role,
      status: EnsembleMember.status,
      joinedAt: EnsembleMember.joinedAt,
      membershipId: EnsembleMember.id,
    })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.status, 'active')))
    .all();
}

/**
 * Get all parts for an ensemble, sorted by sortOrder.
 */
export async function getEnsembleParts(ensembleId: string) {
  const parts = await db
    .select()
    .from(Part)
    .where(eq(Part.ensembleId, ensembleId))
    .all();
  return parts.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get MemberPart assignments for a set of membership IDs.
 */
export async function getMemberPartAssignments(membershipIds: string[]) {
  if (membershipIds.length === 0) return [];
  return await db
    .select()
    .from(MemberPart)
    .where(inArray(MemberPart.membershipId, membershipIds))
    .all();
}

/**
 * Remove a member from an ensemble.
 */
export async function removeMember(membershipId: string) {
  await db.delete(EnsembleMember).where(eq(EnsembleMember.id, membershipId));
}

/**
 * Set the role of a member.
 */
export async function setMemberRole(membershipId: string, role: 'admin' | 'member') {
  await db.update(EnsembleMember).set({ role }).where(eq(EnsembleMember.id, membershipId));
}

export type JoinResult =
  | { ok: true; ensembleId: string }
  | { ok: false; error: string };

/**
 * Attempt to join an ensemble using an invite code.
 * Validates the code, expiry, code-of-conduct agreement, and duplicate membership.
 * On success, inserts a pending EnsembleMember and returns the ensembleId.
 */
/**
 * Get all ensembles a user is a member of (with role info).
 */
export async function getUserEnsembles(userId: string) {
  return await db
    .select({
      id: Ensemble.id,
      slug: Ensemble.slug,
      name: Ensemble.name,
      description: Ensemble.description,
      role: EnsembleMember.role,
      joinedAt: EnsembleMember.joinedAt,
    })
    .from(EnsembleMember)
    .innerJoin(Ensemble, eq(EnsembleMember.ensembleId, Ensemble.id))
    .where(eq(EnsembleMember.userId, userId))
    .all();
}

/**
 * Get the currently active season for an ensemble, or null if none.
 */
export async function getActiveSeasonForEnsemble(ensembleId: string) {
  return await db
    .select()
    .from(Season)
    .where(and(eq(Season.ensembleId, ensembleId), eq(Season.isActive, 1)))
    .get() ?? null;
}

/**
 * Get all active members (with user info) for an ensemble.
 */
export async function getActiveEnsembleMembers(ensembleId: string) {
  return await db
    .select({ id: User.id, name: User.name, avatarUrl: User.avatarUrl })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.status, 'active')))
    .all();
}

export async function joinEnsembleWithCode(
  userId: string,
  code: string,
  agreedToCodeOfConduct: boolean,
): Promise<JoinResult> {
  const invite = await getInviteByCode(code);
  if (!invite) return { ok: false, error: 'Invalid invite code' };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { ok: false, error: 'This invite code has expired' };
  }

  const ensemble = await db
    .select()
    .from(Ensemble)
    .where(eq(Ensemble.id, invite.ensembleId))
    .get() ?? null;

  if (ensemble?.codeOfConduct && !agreedToCodeOfConduct) {
    return { ok: false, error: 'You must agree to the code of conduct to join this ensemble' };
  }

  const existing = await getEnsembleMembership(invite.ensembleId, userId);
  if (existing) return { ok: false, error: 'You are already a member of this ensemble' };

  await db.insert(EnsembleMember).values({
    id: crypto.randomUUID(),
    ensembleId: invite.ensembleId,
    userId,
    role: 'member',
    status: 'pending',
    agreedToCodeOfConductAt: ensemble?.codeOfConduct ? new Date() : null,
  });

  return { ok: true, ensembleId: invite.ensembleId };
}

export async function getMembershipById(membershipId: string) {
  return (await db.select().from(EnsembleMember).where(eq(EnsembleMember.id, membershipId)).get()) ?? null;
}

/**
 * Activate a pending membership and add the member to the ensemble's active season, if any.
 * Returns false if the membership doesn't exist.
 */
export async function approveMember(membershipId: string): Promise<boolean> {
  const membership = await getMembershipById(membershipId);
  if (!membership) return false;

  await db.update(EnsembleMember).set({ status: 'active' }).where(eq(EnsembleMember.id, membershipId));

  const activeSeason = await getActiveSeasonForEnsemble(membership.ensembleId);
  if (activeSeason) {
    const existing = await db
      .select({ id: SeasonMembership.id })
      .from(SeasonMembership)
      .where(and(eq(SeasonMembership.seasonId, activeSeason.id), eq(SeasonMembership.userId, membership.userId)))
      .get();
    if (!existing) {
      await db.insert(SeasonMembership).values({
        id: crypto.randomUUID(),
        seasonId: activeSeason.id,
        userId: membership.userId,
      });
    }
  }
  return true;
}

/** How long the set-password link for a newly added account stays valid. */
export const NEW_ACCOUNT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AddMemberResult =
  | { type: 'added'; userId: string; name: string }
  | { type: 'created'; userId: string; name: string; setPasswordToken: string }
  | { type: 'error'; message: string };

/**
 * Adds someone to an ensemble as an active member, creating their account first if the email
 * is new. A new account has no usable password; the returned token lets them set one.
 */
export async function addMemberByEmail(
  ensembleId: string,
  input: { name: string; email: string; role: 'admin' | 'member' },
): Promise<AddMemberResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  let user = await db
    .select({ id: User.id, name: User.name })
    .from(User)
    .where(sql`lower(${User.email}) = ${email}`)
    .get();
  let setPasswordToken: string | null = null;

  if (!user) {
    if (!name) return { type: 'error', message: 'A name is required for someone without an account.' };
    const id = crypto.randomUUID();
    await db.insert(User).values({ id, email, name, passwordHash: await hashPassword(crypto.randomUUID()) });
    user = { id, name };
    setPasswordToken = await createPasswordResetToken(id, NEW_ACCOUNT_LINK_TTL_MS);
  }

  const existing = await getEnsembleMembership(ensembleId, user.id);
  if (existing?.status === 'active') {
    return { type: 'error', message: `${user.name} is already a member of this ensemble.` };
  }

  const membershipId = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await db.insert(EnsembleMember).values({ id: membershipId, ensembleId, userId: user.id, role: input.role, status: 'pending' });
  } else {
    await db.update(EnsembleMember).set({ role: input.role }).where(eq(EnsembleMember.id, membershipId));
  }
  await approveMember(membershipId);

  return setPasswordToken
    ? { type: 'created', userId: user.id, name: user.name, setPasswordToken }
    : { type: 'added', userId: user.id, name: user.name };
}

export async function getPendingMembers(ensembleId: string) {
  return await db
    .select({
      id: User.id,
      name: User.name,
      email: User.email,
      avatarUrl: User.avatarUrl,
      joinedAt: EnsembleMember.joinedAt,
      membershipId: EnsembleMember.id,
    })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.status, 'pending')))
    .all();
}

export async function getEnsembleInvites(ensembleId: string) {
  return await db.select().from(EnsembleInvite).where(eq(EnsembleInvite.ensembleId, ensembleId)).all();
}

export async function createInvite(ensembleId: string, code: string, createdBy: string) {
  await db.insert(EnsembleInvite).values({ id: crypto.randomUUID(), ensembleId, code, createdBy });
}

export async function deleteInvite(inviteId: string, ensembleId: string) {
  await db
    .delete(EnsembleInvite)
    .where(and(eq(EnsembleInvite.id, inviteId), eq(EnsembleInvite.ensembleId, ensembleId)));
}

export async function addPart(ensembleId: string, name: string, sortOrder: number) {
  await db.insert(Part).values({ id: crypto.randomUUID(), ensembleId, name, sortOrder });
}

export async function editPart(partId: string, ensembleId: string, name: string, sortOrder: number) {
  await db
    .update(Part)
    .set({ name, sortOrder })
    .where(and(eq(Part.id, partId), eq(Part.ensembleId, ensembleId)));
}

/** Deletes a part, unless members are still assigned to it. */
export async function deletePart(partId: string, ensembleId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const assigned = await db.select({ id: MemberPart.id }).from(MemberPart).where(eq(MemberPart.partId, partId)).get();
  if (assigned) return { ok: false, error: 'Cannot delete a part that has members assigned to it.' };
  await db.delete(Part).where(and(eq(Part.id, partId), eq(Part.ensembleId, ensembleId)));
  return { ok: true };
}

/**
 * Active members with their part assignments and groups, for the ensemble dashboard.
 * Group memberships are limited to this ensemble's groups.
 */
export async function getEnsembleMembersOverview(ensembleId: string) {
  const members = await getEnsembleMembersWithUsers(ensembleId);
  const parts = await getEnsembleParts(ensembleId);
  const memberParts = await getMemberPartAssignments(members.map((m) => m.membershipId));
  const groups = await db.select().from(Group).where(eq(Group.ensembleId, ensembleId)).all();
  const groupMemberships =
    groups.length > 0
      ? await db
          .select({ groupId: GroupMembership.groupId, userId: GroupMembership.userId })
          .from(GroupMembership)
          .where(inArray(GroupMembership.groupId, groups.map((g) => g.id)))
          .all()
      : [];
  return { members, parts, memberParts, groups, groupMemberships };
}
