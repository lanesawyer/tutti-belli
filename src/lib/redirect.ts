import { db, eq, EnsembleMember, Ensemble } from 'astro:db';
import { getEnsembleUrlId } from './slug';

export async function getRedirectUrl(userId: string, customRedirect?: string | null): Promise<string> {
  if (customRedirect) {
    return customRedirect;
  }

  // Check how many ensembles the user is part of
  const memberships = await db
    .select()
    .from(EnsembleMember)
    .where(eq(EnsembleMember.userId, userId));

  // If only in one ensemble, redirect to it using slug if available
  if (memberships.length === 1) {
    const ensemble = await db
      .select({ id: Ensemble.id, slug: Ensemble.slug })
      .from(Ensemble)
      .where(eq(Ensemble.id, memberships[0].ensembleId))
      .get();
    if (ensemble) {
      return `/ensembles/${getEnsembleUrlId(ensemble)}`;
    }
  }

  // Otherwise, show the ensembles list
  return '/ensembles';
}
