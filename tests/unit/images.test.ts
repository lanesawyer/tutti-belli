import { describe, it, expect, vi, afterEach } from 'vitest';
import { imageKey, uploadImage } from '../../src/lib/storage.ts';

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('imageKey', () => {
  it('returns the object key for avatar and ensemble image paths', () => {
    expect(imageKey(`/images/avatars/${UUID}.png`)).toBe(`avatars/${UUID}.png`);
    expect(imageKey(`/images/ensembles/${UUID}.webp`)).toBe(`ensembles/${UUID}.webp`);
  });

  it('returns null for data URIs and anything outside the image prefixes', () => {
    expect(imageKey('data:image/png;base64,AAAA')).toBeNull();
    expect(imageKey(`/images/songs/${UUID}.png`)).toBeNull();
    expect(imageKey(`/images/${UUID}/songs/${UUID}-score.pdf`)).toBeNull();
    expect(imageKey(`/images/avatars/../${UUID}.png`)).toBeNull();
    expect(imageKey(`/images/avatars/${UUID}.svg`)).toBeNull();
    expect(imageKey('https://example.com/a.png')).toBeNull();
  });
});

describe('uploadImage', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns a path that imageKey accepts, with an extension from the type', async () => {
    vi.stubEnv('STORAGE_DISABLED', 'true');
    const path = await uploadImage(new File([new Uint8Array(4)], 'Me.JPEG', { type: 'image/jpeg' }), 'avatars');

    expect(path).toMatch(/^\/images\/avatars\/[0-9a-f-]{36}\.jpg$/);
    expect(imageKey(path)).not.toBeNull();
  });
});
