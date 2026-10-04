import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { canViewAs, resolveViewAs } from '../../src/lib/view-as.ts';
import { createSession, createViewAsToken, getUserFromSession, readViewAsToken } from '../../src/lib/session.ts';
import { createUser } from './fixtures.ts';

describe('canViewAs', () => {
  it('lets site admins view as anyone who is not a site admin', async () => {
    const admin = await createUser({ role: 'admin' });
    const otherAdmin = await createUser({ role: 'admin' });
    const member = await createUser();

    expect(canViewAs(admin!, member!)).toBe(true);
    expect(canViewAs(admin!, otherAdmin!)).toBe(false);
    expect(canViewAs(admin!, admin!)).toBe(false);
    expect(canViewAs(member!, admin!)).toBe(false);
  });
});

describe('resolveViewAs', () => {
  it('returns the viewed user for the site admin who started viewing', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();

    const viewed = await resolveViewAs(createViewAsToken(admin!.id, member!.id), admin!);

    expect(viewed?.id).toBe(member!.id);
  });

  it('refuses other admins, demoted admins, admin targets, and expired or forged tokens', async () => {
    const admin = await createUser({ role: 'admin' });
    const otherAdmin = await createUser({ role: 'admin' });
    const member = await createUser();
    const token = createViewAsToken(admin!.id, member!.id);

    expect(await resolveViewAs(token, otherAdmin!)).toBeNull();
    expect(await resolveViewAs(token, { ...admin!, role: 'user' })).toBeNull();
    expect(await resolveViewAs(createViewAsToken(admin!.id, otherAdmin!.id), admin!)).toBeNull();
    expect(await resolveViewAs(createViewAsToken(admin!.id, 'missing'), admin!)).toBeNull();

    const expired = jwt.sign(
      { purpose: 'view-as', adminId: admin!.id, targetId: member!.id, exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET!,
    );
    expect(await resolveViewAs(expired, admin!)).toBeNull();

    const forged = jwt.sign({ purpose: 'view-as', adminId: admin!.id, targetId: member!.id }, 'not-the-secret');
    expect(await resolveViewAs(forged, admin!)).toBeNull();
  });

  it('keeps view-as tokens and session tokens from standing in for each other', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser();

    expect(readViewAsToken(createSession(admin!.id, 0))).toBeNull();
    expect(await getUserFromSession(createViewAsToken(admin!.id, member!.id))).toBeNull();
  });
});
