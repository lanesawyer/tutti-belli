import {
  db,
  eq,
  and,
  Ensemble,
  EnsembleMember,
  Song,
  SongPart,
  SongFile,
  Part,
  Season,
  SeasonSong,
  User,
} from 'astro:db';

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getSongDetailData(ensembleId: string, songId: string) {
  const [ensemble, song, parts, seasons, songPartsData, seasonSongsData, songFiles] =
    await Promise.all([
      db.select().from(Ensemble).where(eq(Ensemble.id, ensembleId)).get(),
      db.select().from(Song).where(eq(Song.id, songId)).get(),
      db.select().from(Part).where(eq(Part.ensembleId, ensembleId)).all(),
      db.select().from(Season).where(eq(Season.ensembleId, ensembleId)).all(),
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
  const [ensemble, songs, parts, seasons, songPartsData, seasonSongsData, songFilesData] =
    await Promise.all([
      db.select().from(Ensemble).where(eq(Ensemble.id, ensembleId)).get(),
      db.select().from(Song).where(eq(Song.ensembleId, ensembleId)).all(),
      db.select().from(Part).where(eq(Part.ensembleId, ensembleId)).all(),
      db.select().from(Season).where(eq(Season.ensembleId, ensembleId)).all(),
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

const VALID_CATEGORIES = ['sheet_music', 'rehearsal_track', 'other'] as const;

export async function addSong(
  ensembleId: string,
  formData: FormData
): Promise<void> {
  const name = (formData.get('name') as string)?.trim();
  if (!name) return;

  const composer = (formData.get('composer') as string)?.trim() || null;
  const arranger = (formData.get('arranger') as string)?.trim() || null;
  const runTimeMinutes = parseInt(formData.get('runTimeMinutes') as string) || 0;
  const runTimeSeconds = parseInt(formData.get('runTimeSeconds') as string) || 0;
  const runTime = runTimeMinutes * 60 + runTimeSeconds || null;
  const selectedParts = formData.getAll('parts') as string[];
  const selectedSeasons = formData.getAll('seasons') as string[];

  const songId = crypto.randomUUID();
  await db.insert(Song).values({ id: songId, ensembleId, name, composer, arranger, runTime });

  for (const partId of selectedParts) {
    await db.insert(SongPart).values({ id: crypto.randomUUID(), songId, partId });
  }
  for (const seasonId of selectedSeasons) {
    await db.insert(SeasonSong).values({ id: crypto.randomUUID(), songId, seasonId });
  }
}

export async function editSong(formData: FormData): Promise<void> {
  const songId = formData.get('songId') as string;
  const name = (formData.get('name') as string)?.trim();
  if (!songId || !name) return;

  const composer = (formData.get('composer') as string)?.trim() || null;
  const arranger = (formData.get('arranger') as string)?.trim() || null;
  const runTimeMinutes = parseInt(formData.get('runTimeMinutes') as string) || 0;
  const runTimeSeconds = parseInt(formData.get('runTimeSeconds') as string) || 0;
  const runTime = runTimeMinutes * 60 + runTimeSeconds || null;
  const selectedParts = formData.getAll('parts') as string[];
  const selectedSeasons = formData.getAll('seasons') as string[];

  await db.update(Song).set({ name, composer, arranger, runTime }).where(eq(Song.id, songId));

  await db.delete(SongPart).where(eq(SongPart.songId, songId));
  await db.delete(SeasonSong).where(eq(SeasonSong.songId, songId));

  for (const partId of selectedParts) {
    await db.insert(SongPart).values({ id: crypto.randomUUID(), songId, partId });
  }
  for (const seasonId of selectedSeasons) {
    await db.insert(SeasonSong).values({ id: crypto.randomUUID(), songId, seasonId });
  }
}

export async function deleteSong(formData: FormData): Promise<void> {
  const songId = formData.get('songId') as string;
  if (!songId) return;

  await db.delete(SongPart).where(eq(SongPart.songId, songId));
  await db.delete(SeasonSong).where(eq(SeasonSong.songId, songId));
  await db.delete(SongFile).where(eq(SongFile.songId, songId));
  await db.delete(Song).where(eq(Song.id, songId));
}

export async function addSongFile(formData: FormData, uploadedBy: string): Promise<void> {
  const songId = formData.get('songId') as string;
  const name = (formData.get('fileName') as string)?.trim();
  const url = (formData.get('fileUrl') as string)?.trim();
  const rawCategory = formData.get('category') as string;
  const category = (VALID_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as (typeof VALID_CATEGORIES)[number])
    : 'other';

  if (!songId || !name || !url) return;

  await db.insert(SongFile).values({ id: crypto.randomUUID(), songId, name, url, category, uploadedBy });
}

export async function deleteSongFile(formData: FormData): Promise<void> {
  const fileId = formData.get('fileId') as string;
  if (!fileId) return;
  await db.delete(SongFile).where(eq(SongFile.id, fileId));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatRuntime(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
