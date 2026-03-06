import { db, eq, or, and, Ensemble, EnsembleMember, EnsembleInvite } from 'astro:db';
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

export type JoinResult =
  | { ok: true; ensembleId: string }
  | { ok: false; error: string };

/**
 * Attempt to join an ensemble using an invite code.
 * Validates the code, expiry, code-of-conduct agreement, and duplicate membership.
 * On success, inserts a pending EnsembleMember and returns the ensembleId.
 */
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
