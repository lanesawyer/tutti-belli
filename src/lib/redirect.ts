import { db, eq, EnsembleMember } from 'astro:db';

export async function getRedirectUrl(userId: string, customRedirect?: string | null): Promise<string> {
  if (customRedirect) {
    return customRedirect;
  }
  
  // Check how many ensembles the user is part of
  const memberships = await db
    .select()
    .from(EnsembleMember)
    .where(eq(EnsembleMember.userId, userId));
  
  // If only in one ensemble, redirect to it
  if (memberships.length === 1) {
    return `/ensembles/${memberships[0].ensembleId}`;
  }
  
  // Otherwise, show the ensembles list
  return '/ensembles';
}
