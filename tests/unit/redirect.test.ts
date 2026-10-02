import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '../../src/lib/redirect.ts';

describe('safeRedirectPath', () => {
  it('keeps same-site paths with their query and hash', () => {
    expect(safeRedirectPath('/ensembles')).toBe('/ensembles');
    expect(safeRedirectPath('/ensembles/choir/events?season=2026#next')).toBe('/ensembles/choir/events?season=2026#next');
    expect(safeRedirectPath('/checkin/ABC123')).toBe('/checkin/ABC123');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    for (const redirect of [
      'https://evil.example',
      'http://evil.example/ensembles',
      '//evil.example',
      '//evil.example/ensembles',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
      'ensembles',
      ' /ensembles',
    ]) {
      expect(safeRedirectPath(redirect), JSON.stringify(redirect)).toBeNull();
    }
  });

  it('treats missing values as no redirect', () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath('')).toBeNull();
  });
});
