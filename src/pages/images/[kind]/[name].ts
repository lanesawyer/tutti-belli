import type { APIRoute } from 'astro';
import { getFileStream, imageKey } from '@lib/storage';

// Avatars and ensemble images. Keys are random UUIDs and a new upload gets a new key, so
// responses can be cached for good. Only the image prefixes are served here: song files share
// the bucket and go through /files with their own access check.
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const key = imageKey(`/images/${params.kind}/${params.name}`);
  if (!key) return new Response('Not found', { status: 404 });

  const file = await getFileStream(key);
  if (!file) return new Response('Not found', { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': file.contentType,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  if (file.contentLength !== undefined) headers['Content-Length'] = String(file.contentLength);

  return new Response(file.body, { headers });
};
