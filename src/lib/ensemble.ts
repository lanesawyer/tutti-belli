import { db, eq, or, Ensemble } from 'astro:db';

/**
 * Look up an ensemble by either its slug or its UUID id.
 */
export async function getEnsembleBySlugOrId(slugOrId: string) {
  const ensemble = await db.select().from(Ensemble)
    .where(or(eq(Ensemble.slug, slugOrId), eq(Ensemble.id, slugOrId)))
    .get();
  return ensemble ?? null;
}
