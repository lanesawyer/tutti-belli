import { describe, it, expect } from 'vitest';
import { getEnsembleAccess, getEnsembleBySlugOrId, updateEnsemble } from '../../src/lib/ensemble.ts';
import { db, Ensemble, eq } from '@db';
import { findUniqueSlug } from '../../src/lib/slug.ts';
import { createUser, createEnsemble, createMembership } from './fixtures.ts';

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

describe('updateEnsemble', () => {
  const fields = {
    name: 'Renamed',
    slug: null,
    description: null,
    discordLink: null,
    discordWebhookUrl: null,
    codeOfConduct: null,
    checkInStartMinutes: 30,
    checkInEndMinutes: 15,
  };

  it('keeps the stored image when imageUrl is left out', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    await db.update(Ensemble).set({ imageUrl: 'data:image/png;base64,AAAA' }).where(eq(Ensemble.id, ensemble!.id));

    await updateEnsemble(ensemble!.id, fields);

    const after = await db.select().from(Ensemble).where(eq(Ensemble.id, ensemble!.id)).get();
    expect(after!.name).toBe('Renamed');
    expect(after!.imageUrl).toBe('data:image/png;base64,AAAA');
  });

  it('clears the image when imageUrl is null', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    await db.update(Ensemble).set({ imageUrl: 'data:image/png;base64,AAAA' }).where(eq(Ensemble.id, ensemble!.id));

    await updateEnsemble(ensemble!.id, { ...fields, imageUrl: null });

    const after = await db.select().from(Ensemble).where(eq(Ensemble.id, ensemble!.id)).get();
    expect(after!.imageUrl).toBeNull();
  });
});

describe('getEnsembleAccess', () => {
  it('lets active members in, as admins only when they are ensemble admins', async () => {
    const owner = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(owner!.id);
    await createMembership(ensemble!.id, owner!.id, { role: 'admin' });
    await createMembership(ensemble!.id, member!.id);

    expect((await getEnsembleAccess(owner!, ensemble!.id))?.isAdmin).toBe(true);
    expect((await getEnsembleAccess(member!, ensemble!.id))?.isAdmin).toBe(false);
  });

  it('keeps out users who are not members', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const ensemble = await createEnsemble(owner!.id);

    expect(await getEnsembleAccess(outsider!, ensemble!.id)).toBeNull();
  });

  it('keeps out pending members unless the page allows them', async () => {
    const owner = await createUser();
    const pending = await createUser();
    const ensemble = await createEnsemble(owner!.id);
    await createMembership(ensemble!.id, pending!.id, { status: 'pending' });

    expect(await getEnsembleAccess(pending!, ensemble!.id)).toBeNull();
    const access = await getEnsembleAccess(pending!, ensemble!.id, { allowPending: true });
    expect(access?.membership?.status).toBe('pending');
    expect(access?.isAdmin).toBe(false);
  });

  it('lets site admins into any ensemble', async () => {
    const owner = await createUser();
    const siteAdmin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(owner!.id);

    const access = await getEnsembleAccess(siteAdmin!, ensemble!.id);
    expect(access?.membership).toBeNull();
    expect(access?.isAdmin).toBe(true);
  });
});
