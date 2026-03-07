import { describe, it, expect, vi } from 'vitest';
import { getSongFileWithAccess } from '../../src/lib/songs.ts';
import { createUser, createEnsemble, createMembership, createSong, createSongFile } from './fixtures.ts';

// Mock storage — not needed for these tests but songs.ts imports it at module level
vi.mock('../../src/lib/storage.ts', () => ({
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadSongFile: vi.fn().mockResolvedValue('https://storage.example.com/test.pdf'),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
}));

describe('getSongFileWithAccess', () => {
  it('returns the file when the user is a member of the ensemble', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, member!.id);
    const song = await createSong(ensemble!.id);
    const file = await createSongFile(song!.id, admin!.id, {
      name: 'Sheet Music',
      url: 'https://storage.example.com/sheet.pdf',
    });

    const result = await getSongFileWithAccess(file!.id, member!.id);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Sheet Music');
    expect(result!.url).toBe('https://storage.example.com/sheet.pdf');
  });

  it('returns null when the user is not a member of the ensemble', async () => {
    const admin = await createUser();
    const outsider = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const song = await createSong(ensemble!.id);
    const file = await createSongFile(song!.id, admin!.id);

    const result = await getSongFileWithAccess(file!.id, outsider!.id);

    expect(result).toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    const user = await createUser();

    const result = await getSongFileWithAccess(crypto.randomUUID(), user!.id);

    expect(result).toBeNull();
  });

  it('the ensemble owner can access their own files', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, admin!.id);
    const song = await createSong(ensemble!.id);
    const file = await createSongFile(song!.id, admin!.id, { name: 'Admin File' });

    const result = await getSongFileWithAccess(file!.id, admin!.id);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Admin File');
  });

  it('a member of ensemble A cannot access files from ensemble B', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensembleA = await createEnsemble(admin!.id, { name: 'Ensemble A' });
    const ensembleB = await createEnsemble(admin!.id, { name: 'Ensemble B' });

    // member only belongs to ensemble A
    await createMembership(ensembleA!.id, member!.id);

    const songB = await createSong(ensembleB!.id);
    const fileB = await createSongFile(songB!.id, admin!.id, { name: 'Ensemble B File' });

    const result = await getSongFileWithAccess(fileB!.id, member!.id);

    expect(result).toBeNull();
  });
});
