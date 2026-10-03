import { db, eq, EnsembleMember, Ensemble } from '@db';
import { getEnsembleUrlId } from './slug';

const ORIGIN = 'http://tutti-belli.invalid';

/**
 * Returns the redirect as a same-site path, or null if it would leave the site. The value comes
 * from the `?redirect=` query string, so anything absolute or protocol-relative (`//evil.com`,
 * `/\\evil.com`, `/\t/evil.com`) must be rejected; resolving it the way a browser would catches
 * every variant.
 */
export function safeRedirectPath(redirect: string | null | undefined): string | null {
  if (!redirect || !redirect.startsWith('/')) return null;
  let url: URL;
  try {
    url = new URL(redirect, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  return url.pathname + url.search + url.hash;
}

export async function getRedirectUrl(userId: string, customRedirect?: string | null): Promise<string> {
  const safe = safeRedirectPath(customRedirect);
  if (safe) {
    return safe;
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
