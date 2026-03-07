import type { APIRoute } from 'astro';
import { getFileStream } from '@lib/storage';
import { getSongFileWithAccess } from '@lib/songs';

export const GET: APIRoute = async ({ params, locals, url, request }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { fileId } = params;
  if (!fileId) return new Response('Not found', { status: 404 });

  const inline = url.searchParams.has('inline');
  const range = request.headers.get('range') ?? undefined;

  const row = await getSongFileWithAccess(fileId, user.id);
  if (!row) return new Response('Not found', { status: 404 });

  const { body, contentType, contentLength, contentRange, status } = await getFileStream(row.url, range);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Disposition': inline
      ? `inline; filename="${encodeURIComponent(row.name)}"`
      : `attachment; filename="${encodeURIComponent(row.name)}"`,
    'Cache-Control': 'private, max-age=300',
    'Accept-Ranges': 'bytes',
  };
  if (contentLength !== undefined) headers['Content-Length'] = String(contentLength);
  if (contentRange) headers['Content-Range'] = contentRange;

  return new Response(body, { status, headers });
};
