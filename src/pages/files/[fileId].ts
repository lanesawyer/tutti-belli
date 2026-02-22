import type { APIRoute } from 'astro';
import { db, eq, and, SongFile, Song, EnsembleMember } from 'astro:db';
import { getFileStream } from '../../lib/storage';

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { fileId } = params;
  if (!fileId) return new Response('Not found', { status: 404 });

  // Load the file record and join through to the ensemble
  const row = await db
    .select({
      url: SongFile.url,
      name: SongFile.name,
      ensembleId: Song.ensembleId,
    })
    .from(SongFile)
    .innerJoin(Song, eq(SongFile.songId, Song.id))
    .where(eq(SongFile.id, fileId))
    .get();

  if (!row) return new Response('Not found', { status: 404 });

  // Verify the requesting user is a member of the ensemble
  const membership = await db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, row.ensembleId), eq(EnsembleMember.userId, user.id)))
    .get();

  if (!membership) return new Response('Forbidden', { status: 403 });

  const { body, contentType, contentLength } = await getFileStream(row.url);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(row.name)}"`,
    'Cache-Control': 'private, max-age=300',
  };
  if (contentLength !== undefined) {
    headers['Content-Length'] = String(contentLength);
  }

  return new Response(body, { status: 200, headers });
};
