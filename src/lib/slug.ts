import { db, eq, Ensemble } from 'astro:db';

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a slug from the name. If that slug is already taken, fall back to the UUID.
 */
export async function findUniqueSlug(name: string, uuid: string): Promise<string> {
  const candidate = generateSlug(name);
  if (!candidate) return uuid;
  const existing = await db.select({ id: Ensemble.id }).from(Ensemble)
    .where(eq(Ensemble.slug, candidate)).get();
  return existing ? uuid : candidate;
}

/**
 * Returns the canonical URL identifier for an ensemble: slug if set, otherwise UUID.
 */
export function getEnsembleUrlId(ensemble: { id: string; slug?: string | null }): string {
  return ensemble.slug || ensemble.id;
}
