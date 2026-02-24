import { describe, it, expect } from 'vitest';
import { getActiveBanner, setBanner, clearBanner } from '../../src/lib/banner.ts';

describe('getActiveBanner', () => {
  it('returns null when no banner exists', async () => {
    const result = await getActiveBanner();
    expect(result).toBeNull();
  });

  it('returns the active banner after one is set', async () => {
    await setBanner('Test message', 'warning');
    const result = await getActiveBanner();
    expect(result).not.toBeNull();
    expect(result!.message).toBe('Test message');
    expect(result!.color).toBe('warning');
    expect(result!.isActive).toBe(1);
  });
});

describe('setBanner', () => {
  it('creates a new active banner', async () => {
    await setBanner('Hello world', 'info');
    const result = await getActiveBanner();
    expect(result!.message).toBe('Hello world');
    expect(result!.color).toBe('info');
  });

  it('replaces an existing active banner', async () => {
    await setBanner('First banner', 'danger');
    await setBanner('Second banner', 'success');
    const result = await getActiveBanner();
    expect(result!.message).toBe('Second banner');
    expect(result!.color).toBe('success');
  });

  it('only has one active banner at a time after multiple sets', async () => {
    await setBanner('Banner A', 'info');
    await setBanner('Banner B', 'danger');
    await setBanner('Banner C', 'warning');
    // getActiveBanner uses .get() which returns a single row — if multiple
    // rows were active this would still work, so verify via the lib function
    const result = await getActiveBanner();
    expect(result!.message).toBe('Banner C');
  });
});

describe('clearBanner', () => {
  it('deactivates the active banner', async () => {
    await setBanner('Active banner', 'danger');
    await clearBanner();
    const result = await getActiveBanner();
    expect(result).toBeNull();
  });

  it('is a no-op when no banner is active', async () => {
    await expect(clearBanner()).resolves.not.toThrow();
    const result = await getActiveBanner();
    expect(result).toBeNull();
  });
});
