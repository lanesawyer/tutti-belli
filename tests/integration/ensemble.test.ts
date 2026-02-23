import { describe, it, expect } from 'vitest';
import { getEnsembleBySlugOrId } from '../../src/lib/ensemble.ts';
import { findUniqueSlug } from '../../src/lib/slug.ts';
import { createUser, createEnsemble } from './fixtures.ts';
import { db, Ensemble, eq } from 'astro:db';

describe('getEnsembleBySlugOrId', () => {
  it('returns an ensemble when looked up by UUID id', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, { name: 'String Quartet' });

    const result = await getEnsembleBySlugOrId(ensemble!.id);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('String Quartet');
  });

  it('returns an ensemble when looked up by slug', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id, { name: 'Chamber Choir', slug: 'chamber-choir' });

    const result = await getEnsembleBySlugOrId('chamber-choir');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(ensemble!.id);
  });

  it('returns null for an unknown id or slug', async () => {
    const result = await getEnsembleBySlugOrId('nonexistent-slug-or-id');
    expect(result).toBeNull();
  });

  it('returns the correct ensemble when multiple exist', async () => {
    const admin = await createUser({ role: 'admin' });
    await createEnsemble(admin!.id, { name: 'Ensemble One', slug: 'ensemble-one' });
    await createEnsemble(admin!.id, { name: 'Ensemble Two', slug: 'ensemble-two' });

    const result = await getEnsembleBySlugOrId('ensemble-two');
    expect(result!.name).toBe('Ensemble Two');
  });
});

describe('findUniqueSlug', () => {
  it('returns the generated slug when it is not already taken', async () => {
    const admin = await createUser({ role: 'admin' });
    const uuid = crypto.randomUUID();

    const slug = await findUniqueSlug('My Ensemble', uuid);
    expect(slug).toBe('my-ensemble');
  });

  it('returns the uuid when the slug is already taken', async () => {
    const admin = await createUser({ role: 'admin' });
    // Create an ensemble with the slug that would be generated
    await createEnsemble(admin!.id, { slug: 'my-ensemble' });

    const uuid = crypto.randomUUID();
    const slug = await findUniqueSlug('My Ensemble', uuid);
    expect(slug).toBe(uuid);
  });

  it('returns the uuid when the generated slug would be empty', async () => {
    const uuid = crypto.randomUUID();
    const slug = await findUniqueSlug('!!!', uuid);
    expect(slug).toBe(uuid);
  });
});
