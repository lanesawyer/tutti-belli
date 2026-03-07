import {
  db,
  eq,
  and,
  EnsembleMember,
  Song,
  SongPart,
  SongFile,
  Part,
  Season,
  SeasonSong,
  User,
} from 'astro:db';
import { uploadSongFile, validateSongFile, deleteStorageFile } from './storage';
import { getEnsembleBySlugOrId } from './ensemble';

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getSongDetailData(ensembleId: string, songId: string) {
  const ensemble = await getEnsembleBySlugOrId(ensembleId);
  if (!ensemble) {
    return { ensemble: null, song: null, parts: [], seasons: [], songPartsData: [], seasonSongsData: [], songFiles: [] };
  }

  const [song, parts, seasons, songPartsData, seasonSongsData, songFiles] =
    await Promise.all([
      db.select().from(Song).where(eq(Song.id, songId)).get(),
      db.select().from(Part).where(eq(Part.ensembleId, ensemble.id)).all(),
      db.select().from(Season).where(eq(Season.ensembleId, ensemble.id)).all(),
      db.select().from(SongPart).where(eq(SongPart.songId, songId)).all(),
      db.select().from(SeasonSong).where(eq(SeasonSong.songId, songId)).all(),
      db
        .select({
          id: SongFile.id,
          name: SongFile.name,
          url: SongFile.url,
          category: SongFile.category,
          uploadedAt: SongFile.uploadedAt,
          uploaderName: User.name,
        })
        .from(SongFile)
        .innerJoin(User, eq(SongFile.uploadedBy, User.id))
        .where(eq(SongFile.songId, songId))
        .all(),
    ]);

  return { ensemble, song, parts, seasons, songPartsData, seasonSongsData, songFiles };
}

export async function getSongsPageData(ensembleId: string) {
  const ensemble = await getEnsembleBySlugOrId(ensembleId);
  if (!ensemble) {
    return { ensemble: null, songs: [], parts: [], seasons: [], songPartsData: [], seasonSongsData: [], songFilesData: [] };
  }

  const [songs, parts, seasons, songPartsData, seasonSongsData, songFilesData] =
    await Promise.all([
      db.select().from(Song).where(eq(Song.ensembleId, ensemble.id)).all(),
      db.select().from(Part).where(eq(Part.ensembleId, ensemble.id)).all(),
      db.select().from(Season).where(eq(Season.ensembleId, ensemble.id)).all(),
      db.select().from(SongPart).all(),
      db.select().from(SeasonSong).all(),
      db.select().from(SongFile).all(),
    ]);

  return { ensemble, songs, parts, seasons, songPartsData, seasonSongsData, songFilesData };
}

export async function getMembership(ensembleId: string, userId: string) {
  return db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, userId)))
    .get();
}

export async function getSongFileWithAccess(fileId: string, userId: string) {
  const row = await db
    .select({ url: SongFile.url, name: SongFile.name, ensembleId: Song.ensembleId })
    .from(SongFile)
    .innerJoin(Song, eq(SongFile.songId, Song.id))
    .where(eq(SongFile.id, fileId))
    .get();

  if (!row) return null;

  const membership = await db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, row.ensembleId), eq(EnsembleMember.userId, userId)))
    .get();

  if (!membership) return null;

  return { url: row.url, name: row.name };
}

// ─── Map builders ───────────────────────────────────────────────────────────

export function buildSongPartsMap(songPartsData: { songId: string; partId: string }[]) {
  const map = new Map<string, string[]>();
  for (const sp of songPartsData) {
    if (!map.has(sp.songId)) map.set(sp.songId, []);
    map.get(sp.songId)!.push(sp.partId);
  }
  return map;
}

export function buildSongSeasonsMap(seasonSongsData: { songId: string; seasonId: string }[]) {
  const map = new Map<string, string[]>();
  for (const ss of seasonSongsData) {
    if (!map.has(ss.songId)) map.set(ss.songId, []);
    map.get(ss.songId)!.push(ss.seasonId);
  }
  return map;
}

export function buildSongFilesMap<T extends { songId: string }>(
  songIds: Set<string>,
  filesData: T[]
) {
  const map = new Map<string, T[]>();
  for (const file of filesData) {
    if (!songIds.has(file.songId)) continue;
    if (!map.has(file.songId)) map.set(file.songId, []);
    map.get(file.songId)!.push(file);
  }
  return map;
}

// ─── Actions ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = ['sheet_music', 'rehearsal_track', 'other', 'link'] as const;

export interface SongInput {
  name: string;
  composer?: string;
  arranger?: string;
  runTimeMinutes: number;
  runTimeSeconds: number;
  parts: string[];
  seasons: string[];
}

export async function addSong(ensembleId: string, input: SongInput): Promise<void> {
  const name = input.name.trim();
  if (!name) return;

  const composer = input.composer?.trim() || null;
  const arranger = input.arranger?.trim() || null;
  const runTime = input.runTimeMinutes * 60 + input.runTimeSeconds || null;

  const songId = crypto.randomUUID();
  await db.insert(Song).values({ id: songId, ensembleId, name, composer, arranger, runTime });

  for (const partId of input.parts) {
    await db.insert(SongPart).values({ id: crypto.randomUUID(), songId, partId });
  }
  for (const seasonId of input.seasons) {
    await db.insert(SeasonSong).values({ id: crypto.randomUUID(), songId, seasonId });
  }
}

export interface EditSongInput extends SongInput {
  songId: string;
}

export async function editSong(input: EditSongInput): Promise<void> {
  const { songId } = input;
  const name = input.name.trim();
  if (!songId || !name) return;

  const composer = input.composer?.trim() || null;
  const arranger = input.arranger?.trim() || null;
  const runTime = input.runTimeMinutes * 60 + input.runTimeSeconds || null;

  await db.update(Song).set({ name, composer, arranger, runTime }).where(eq(Song.id, songId));

  await db.delete(SongPart).where(eq(SongPart.songId, songId));
  await db.delete(SeasonSong).where(eq(SeasonSong.songId, songId));

  for (const partId of input.parts) {
    await db.insert(SongPart).values({ id: crypto.randomUUID(), songId, partId });
  }
  for (const seasonId of input.seasons) {
    await db.insert(SeasonSong).values({ id: crypto.randomUUID(), songId, seasonId });
  }
}

export async function deleteSong(songId: string): Promise<void> {
  if (!songId) return;

  await db.delete(SongPart).where(eq(SongPart.songId, songId));
  await db.delete(SeasonSong).where(eq(SeasonSong.songId, songId));

  const files = await db.select().from(SongFile).where(eq(SongFile.songId, songId)).all();
  await Promise.all(files.map((f) => deleteStorageFile(f.url)));
  await db.delete(SongFile).where(eq(SongFile.songId, songId));

  await db.delete(Song).where(eq(Song.id, songId));
}

export interface AddSongFileInput {
  songId: string;
  fileName: string;
  category: (typeof VALID_CATEGORIES)[number];
  fileUrl?: string;
  file?: File;
}

export async function addSongFile(
  input: AddSongFileInput,
  uploadedBy: string,
  ensembleId?: string
): Promise<{ error?: string }> {
  const { songId } = input;
  const name = input.fileName.trim();
  const category = (VALID_CATEGORIES as readonly string[]).includes(input.category)
    ? (input.category as (typeof VALID_CATEGORIES)[number])
    : 'other';

  if (!songId || !name) return {};

  let url: string;

  if (category === 'link') {
    url = input.fileUrl?.trim() ?? '';
    if (!url) return { error: 'A URL is required for links.' };
  } else if (input.file && input.file.size > 0) {
    if (!ensembleId) return { error: 'Missing ensemble context for upload.' };
    const validation = validateSongFile(input.file);
    if (!validation.valid) return { error: validation.error };
    url = await uploadSongFile(input.file, ensembleId);
  } else {
    return { error: 'A file is required.' };
  }

  await db.insert(SongFile).values({ id: crypto.randomUUID(), songId, name, url, category, uploadedBy });
  return {};
}

export async function deleteSongFile(fileId: string): Promise<void> {
  if (!fileId) return;

  const file = await db.select().from(SongFile).where(eq(SongFile.id, fileId)).get();
  if (file && file.category !== 'link') await deleteStorageFile(file.url);
  await db.delete(SongFile).where(eq(SongFile.id, fileId));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatRuntime(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function categoryLabel(cat: string): string {
  if (cat === 'sheet_music') return 'Sheet Music';
  if (cat === 'rehearsal_track') return 'Rehearsal Track';
  if (cat === 'link') return 'Link';
  return 'Other';
}

export function categoryTagClass(cat: string): string {
  if (cat === 'sheet_music') return 'is-success';
  if (cat === 'rehearsal_track') return 'is-warning';
  if (cat === 'link') return 'is-info';
  return 'is-light';
}

export function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch {}
  return null;
}
