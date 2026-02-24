import { describe, it, expect } from 'vitest';
import { isSiteAdmin, isEnsembleAdmin, canManageEnsemble } from '../../src/lib/permissions.ts';

describe('isSiteAdmin', () => {
  it('returns true when role is admin', () => {
    expect(isSiteAdmin({ role: 'admin' })).toBe(true);
  });

  it('returns false when role is user', () => {
    expect(isSiteAdmin({ role: 'user' })).toBe(false);
  });

  it('returns false when role is ensemble_admin', () => {
    expect(isSiteAdmin({ role: 'ensemble_admin' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSiteAdmin(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSiteAdmin(undefined)).toBe(false);
  });
});

describe('isEnsembleAdmin', () => {
  it('returns true when membership role is admin', () => {
    expect(isEnsembleAdmin({ role: 'admin' })).toBe(true);
  });

  it('returns false when membership role is member', () => {
    expect(isEnsembleAdmin({ role: 'member' })).toBe(false);
  });

  it('returns false for null membership', () => {
    expect(isEnsembleAdmin(null)).toBe(false);
  });

  it('returns false for undefined membership', () => {
    expect(isEnsembleAdmin(undefined)).toBe(false);
  });
});

describe('canManageEnsemble', () => {
  it('returns true when user is site admin', () => {
    expect(canManageEnsemble({ role: 'admin' }, { role: 'member' })).toBe(true);
  });

  it('returns true when membership is ensemble admin', () => {
    expect(canManageEnsemble({ role: 'user' }, { role: 'admin' })).toBe(true);
  });

  it('returns true when both are admins', () => {
    expect(canManageEnsemble({ role: 'admin' }, { role: 'admin' })).toBe(true);
  });

  it('returns false when neither is admin', () => {
    expect(canManageEnsemble({ role: 'user' }, { role: 'member' })).toBe(false);
  });

  it('returns false when user is null and membership is non-admin', () => {
    expect(canManageEnsemble(null, { role: 'member' })).toBe(false);
  });

  it('returns false when both are null', () => {
    expect(canManageEnsemble(null, null)).toBe(false);
  });
});
