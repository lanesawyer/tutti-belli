import { describe, it, expect, vi } from 'vitest';
import { addSong, editSong, deleteSong, addSongFile, deleteSongFile } from '../../src/lib/songs.ts';
import { db, Song, SongPart, SeasonSong, SongFile, eq } from 'astro:db';
import { createUser, createEnsemble, createSeason, createPart, createSong, createSongFile } from './fixtures.ts';

// Mock storage — avoid real S3 calls
vi.mock('../../src/lib/storage.ts', () => ({
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadSongFile: vi.fn().mockResolvedValue('https://storage.example.com/test-file.pdf'),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
}));

describe('addSong', () => {
  it('inserts a new Song row', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await addSong(ensemble!.id, {
      name: 'Ode to Joy',
      composer: 'Beethoven',
      arranger: '',
      runTimeMinutes: 4,
      runTimeSeconds: 30,
      parts: [],
      seasons: [],
    });

    const songs = await db
      .select()
      .from(Song)
      .where(eq(Song.ensembleId, ensemble!.id))
      .all();
    expect(songs).toHaveLength(1);
    expect(songs[0].name).toBe('Ode to Joy');
    expect(songs[0].composer).toBe('Beethoven');
    expect(songs[0].runTime).toBe(4 * 60 + 30);
  });

  it('associates song with parts and seasons', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const part = await createPart(ensemble!.id, { name: 'Soprano' });
    const season = await createSeason(ensemble!.id);

    await addSong(ensemble!.id, {
      name: 'Test Song',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [part!.id],
      seasons: [season!.id],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    const songId = songs[0].id;

    const songParts = await db.select().from(SongPart).where(eq(SongPart.songId, songId)).all();
    expect(songParts).toHaveLength(1);
    expect(songParts[0].partId).toBe(part!.id);

    const seasonSongs = await db.select().from(SeasonSong).where(eq(SeasonSong.songId, songId)).all();
    expect(seasonSongs).toHaveLength(1);
    expect(seasonSongs[0].seasonId).toBe(season!.id);
  });

  it('stores null runTime when both minutes and seconds are 0', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await addSong(ensemble!.id, {
      name: 'No Runtime',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [],
      seasons: [],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    expect(songs[0].runTime).toBeNull();
  });

  it('does nothing when the name is empty', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await addSong(ensemble!.id, {
      name: '',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [],
      seasons: [],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    expect(songs).toHaveLength(0);
  });
});

describe('editSong', () => {
  it('updates the song metadata', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await addSong(ensemble!.id, {
      name: 'Original Title',
      composer: 'Old Composer',
      arranger: '',
      runTimeMinutes: 3,
      runTimeSeconds: 0,
      parts: [],
      seasons: [],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    const songId = songs[0].id;

    await editSong({
      songId,
      name: 'Updated Title',
      composer: 'New Composer',
      arranger: 'An Arranger',
      runTimeMinutes: 5,
      runTimeSeconds: 30,
      parts: [],
      seasons: [],
    });

    const updated = await db.select().from(Song).where(eq(Song.id, songId)).get();
    expect(updated!.name).toBe('Updated Title');
    expect(updated!.composer).toBe('New Composer');
    expect(updated!.arranger).toBe('An Arranger');
    expect(updated!.runTime).toBe(5 * 60 + 30);
  });

  it('replaces parts and seasons on edit', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const part1 = await createPart(ensemble!.id, { name: 'Soprano' });
    const part2 = await createPart(ensemble!.id, { name: 'Alto' });
    const season = await createSeason(ensemble!.id);

    await addSong(ensemble!.id, {
      name: 'Test Song',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [part1!.id],
      seasons: [season!.id],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    const songId = songs[0].id;

    // Replace part1 with part2, remove season
    await editSong({
      songId,
      name: 'Test Song',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [part2!.id],
      seasons: [],
    });

    const songParts = await db.select().from(SongPart).where(eq(SongPart.songId, songId)).all();
    expect(songParts).toHaveLength(1);
    expect(songParts[0].partId).toBe(part2!.id);

    const seasonSongs = await db.select().from(SeasonSong).where(eq(SeasonSong.songId, songId)).all();
    expect(seasonSongs).toHaveLength(0);
  });
});

describe('deleteSong', () => {
  it('removes the song and all related rows', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const part = await createPart(ensemble!.id);
    const season = await createSeason(ensemble!.id);

    await addSong(ensemble!.id, {
      name: 'Song to Delete',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [part!.id],
      seasons: [season!.id],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    const songId = songs[0].id;

    await deleteSong(songId);

    expect(await db.select().from(Song).where(eq(Song.id, songId)).get()).toBeUndefined();
    expect(await db.select().from(SongPart).where(eq(SongPart.songId, songId)).all()).toHaveLength(0);
    expect(await db.select().from(SeasonSong).where(eq(SeasonSong.songId, songId)).all()).toHaveLength(0);
  });
});

describe('addSongFile', () => {
  it('adds a link-type file without uploading', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await addSong(ensemble!.id, {
      name: 'Song With Link',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [],
      seasons: [],
    });

    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    const songId = songs[0].id;

    const result = await addSongFile(
      { songId, fileName: 'YouTube Link', category: 'link', fileUrl: 'https://youtu.be/test' },
      admin!.id
    );

    expect(result.error).toBeUndefined();
    const files = await db.select().from(SongFile).where(eq(SongFile.songId, songId)).all();
    expect(files).toHaveLength(1);
    expect(files[0].url).toBe('https://youtu.be/test');
    expect(files[0].category).toBe('link');
  });

  it('returns an error when link category has no URL', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await addSong(ensemble!.id, {
      name: 'Test',
      composer: '',
      arranger: '',
      runTimeMinutes: 0,
      runTimeSeconds: 0,
      parts: [],
      seasons: [],
    });
    const songs = await db.select().from(Song).where(eq(Song.ensembleId, ensemble!.id)).all();
    const songId = songs[0].id;

    const result = await addSongFile(
      { songId, fileName: 'Bad Link', category: 'link', fileUrl: '' },
      admin!.id
    );

    expect(result.error).toMatch(/URL/i);
  });

  it('uploads a file and inserts a SongFile row', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const song = await createSong(ensemble!.id, { name: 'Upload Test' });

    const mockFile = new File(['pdf content'], 'sheet.pdf', { type: 'application/pdf' });
    const result = await addSongFile(
      { songId: song!.id, fileName: 'Sheet Music', category: 'sheet_music', file: mockFile },
      admin!.id,
      ensemble!.id
    );

    expect(result.error).toBeUndefined();
    const files = await db.select().from(SongFile).where(eq(SongFile.songId, song!.id)).all();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('Sheet Music');
    expect(files[0].category).toBe('sheet_music');
    expect(files[0].url).toBe('https://storage.example.com/test-file.pdf');
  });

  it('returns an error when no file and no URL are provided for a non-link category', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const song = await createSong(ensemble!.id);

    const result = await addSongFile(
      { songId: song!.id, fileName: 'Empty', category: 'sheet_music' },
      admin!.id,
      ensemble!.id
    );

    expect(result.error).toBeDefined();
  });
});

describe('deleteSongFile', () => {
  it('removes a link-type file row without calling storage', async () => {
    const { deleteStorageFile } = await import('../../src/lib/storage.ts');
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const song = await createSong(ensemble!.id);
    const file = await createSongFile(song!.id, admin!.id, {
      category: 'link',
      url: 'https://youtu.be/test',
    });

    await deleteSongFile(file!.id);

    expect(await db.select().from(SongFile).where(eq(SongFile.id, file!.id)).get()).toBeUndefined();
    expect(deleteStorageFile).not.toHaveBeenCalled();
  });

  it('removes a file row and calls deleteStorageFile for non-link files', async () => {
    const { deleteStorageFile } = await import('../../src/lib/storage.ts');
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const song = await createSong(ensemble!.id);
    const file = await createSongFile(song!.id, admin!.id, {
      category: 'sheet_music',
      url: 'https://storage.example.com/sheet.pdf',
    });

    await deleteSongFile(file!.id);

    expect(await db.select().from(SongFile).where(eq(SongFile.id, file!.id)).get()).toBeUndefined();
    expect(deleteStorageFile).toHaveBeenCalledWith('https://storage.example.com/sheet.pdf');
  });

  it('does nothing when given an empty fileId', async () => {
    // Should not throw
    await expect(deleteSongFile('')).resolves.toBeUndefined();
  });

  it('deletes all song files when the parent song is deleted', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const song = await createSong(ensemble!.id);
    await createSongFile(song!.id, admin!.id, { category: 'link', url: 'https://youtu.be/a' });
    await createSongFile(song!.id, admin!.id, { category: 'link', url: 'https://youtu.be/b' });

    await deleteSong(song!.id);

    const files = await db.select().from(SongFile).where(eq(SongFile.songId, song!.id)).all();
    expect(files).toHaveLength(0);
  });
});
