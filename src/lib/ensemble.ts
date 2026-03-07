import { db, eq, or, and, ne, inArray, Ensemble, EnsembleMember, EnsembleInvite, EnsembleLink, MemberPart, Part, Season, User } from 'astro:db';
import { canManageEnsemble, isSiteAdmin } from './permissions';

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
  },
) {
  await db.update(Ensemble).set(data).where(eq(Ensemble.id, ensembleId));
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
