import { describe, it, expect } from 'vitest';
import { getInviteByCode, joinEnsembleWithCode } from '../../src/lib/ensemble.ts';
import { createUser, createEnsemble, createInvite, createMembership } from './fixtures.ts';
import { db, EnsembleMember, eq, Ensemble } from 'astro:db';
// The ensembles.join action is a thin wrapper around joinEnsembleWithCode — all business
// logic is covered by the tests below. Auth enforcement (UNAUTHORIZED) is a framework
// concern handled uniformly across all actions.

describe('getInviteByCode', () => {
  it('returns the invite for a valid code', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin.id);
    const invite = await createInvite(ensemble.id, admin.id, { code: 'TESTCODE' });

    const result = await getInviteByCode('TESTCODE');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(invite.id);
  });

  it('is case-insensitive', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin.id);
    await createInvite(ensemble.id, admin.id, { code: 'UPPER123' });

    const result = await getInviteByCode('upper123');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('UPPER123');
  });

  it('returns null for an unknown code', async () => {
    const result = await getInviteByCode('NOTFOUND');
    expect(result).toBeNull();
  });
});

describe('joinEnsembleWithCode', () => {
  it('adds a pending member and returns ok on a valid invite', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin.id);
    const invite = await createInvite(ensemble.id, admin.id, { code: 'JOINTEST' });
    const user = await createUser();

    const result = await joinEnsembleWithCode(user.id, 'JOINTEST', false);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.ensembleId).toBe(ensemble.id);

    const member = await db
      .select()
      .from(EnsembleMember)
      .where(eq(EnsembleMember.userId, user.id))
      .get();
    expect(member).not.toBeNull();
    expect(member!.status).toBe('pending');
    expect(member!.role).toBe('member');
    expect(member!.ensembleId).toBe(invite.ensembleId);
  });

  it('returns an error for an invalid code', async () => {
    const user = await createUser();
    const result = await joinEnsembleWithCode(user.id, 'BADCODE1', false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toMatch(/invalid invite code/i);
  });

  it('returns an error for an expired invite', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin.id);
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
    await createInvite(ensemble.id, admin.id, { code: 'EXPIRED1', expiresAt: pastDate });
    const user = await createUser();

    const result = await joinEnsembleWithCode(user.id, 'EXPIRED1', false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toMatch(/expired/i);
  });

  it('accepts a future expiry date', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin.id);
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await createInvite(ensemble.id, admin.id, { code: 'FUTURE01', expiresAt: futureDate });
    const user = await createUser();

    const result = await joinEnsembleWithCode(user.id, 'FUTURE01', false);
    expect(result.ok).toBe(true);
  });

  it('returns an error when code of conduct not agreed to', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensembleId = crypto.randomUUID();
    await db.insert(Ensemble).values({
      id: ensembleId,
      name: 'CoC Ensemble',
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
      createdBy: admin.id,
      codeOfConduct: 'Be nice.',
    });
    await createInvite(ensembleId, admin.id, { code: 'COCTEST1' });
    const user = await createUser();

    const result = await joinEnsembleWithCode(user.id, 'COCTEST1', false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toMatch(/code of conduct/i);
  });

  it('succeeds when code of conduct is agreed to', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensembleId = crypto.randomUUID();
    await db.insert(Ensemble).values({
      id: ensembleId,
      name: 'CoC Ensemble 2',
      checkInStartMinutes: 30,
      checkInEndMinutes: 15,
      createdBy: admin.id,
      codeOfConduct: 'Be nice.',
    });
    await createInvite(ensembleId, admin.id, { code: 'COCTEST2' });
    const user = await createUser();

    const result = await joinEnsembleWithCode(user.id, 'COCTEST2', true);
    expect(result.ok).toBe(true);

    const member = await db
      .select()
      .from(EnsembleMember)
      .where(eq(EnsembleMember.userId, user.id))
      .get();
    expect(member!.agreedToCodeOfConductAt).not.toBeNull();
  });

  it('returns an error when the user is already a member', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin.id);
    await createInvite(ensemble.id, admin.id, { code: 'DUPETEST' });
    const user = await createUser();
    await createMembership(ensemble.id, user.id);

    const result = await joinEnsembleWithCode(user.id, 'DUPETEST', false);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toMatch(/already a member/i);
  });
});
