import { db, eq, or, and, Ensemble, EnsembleMember } from 'astro:db';
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
