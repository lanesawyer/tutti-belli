import { describe, it, expect } from 'vitest';
import { getRedirectUrl } from '@lib/redirect';
import { createUser, createEnsemble, createMembership } from './fixtures.ts';

describe('getRedirectUrl', () => {
  it('honors a same-site redirect', async () => {
    const user = await createUser();
    expect(await getRedirectUrl(user.id, '/ensembles/choir/events')).toBe('/ensembles/choir/events');
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'ignores the off-site redirect %s and falls back to the default',
    async (redirect) => {
      const user = await createUser();
      expect(await getRedirectUrl(user.id, redirect)).toBe('/ensembles');
    },
  );

  it('sends a member of exactly one ensemble to that ensemble, by slug when it has one', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user.id, { slug: 'chamber-choir' });
    await createMembership(ensemble.id, user.id);
    expect(await getRedirectUrl(user.id)).toBe('/ensembles/chamber-choir');
  });

  it('uses the ensemble id when there is no slug', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user.id);
    await createMembership(ensemble.id, user.id);
    expect(await getRedirectUrl(user.id, null)).toBe(`/ensembles/${ensemble.id}`);
  });

  it('sends a member of several ensembles, or none, to the list', async () => {
    const user = await createUser();
    expect(await getRedirectUrl(user.id)).toBe('/ensembles');

    for (const name of ['One', 'Two']) {
      const ensemble = await createEnsemble(user.id, { name });
      await createMembership(ensemble.id, user.id);
    }
    expect(await getRedirectUrl(user.id)).toBe('/ensembles');
  });
});
