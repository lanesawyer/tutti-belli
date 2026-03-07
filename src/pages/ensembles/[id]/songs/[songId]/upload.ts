import type { APIRoute } from 'astro';
import { canManageEnsemble } from '@lib/permissions';
import { addSongFile } from '@lib/songs';
import { getEnsembleBySlugOrId, getEnsembleMembership } from '@lib/ensemble';

export const POST: APIRoute = async ({ params, locals, request, redirect }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id, songId } = params;
  if (!id || !songId) return new Response('Not found', { status: 404 });

  const ensemble = await getEnsembleBySlugOrId(id);
  if (!ensemble) return new Response('Ensemble not found', { status: 404 });

  const membership = await getEnsembleMembership(ensemble.id, user.id);

  if (!canManageEnsemble(user, membership)) {
    return new Response('Forbidden', { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const fileName = (formData.get('fileName') as string | null)?.trim() ?? '';
  const category = (formData.get('category') as string | null) ?? 'other';
  const fileUrl = (formData.get('fileUrl') as string | null) ?? undefined;
  const file = formData.get('file');

  const result = await addSongFile(
    {
      songId,
      fileName,
      category: category as 'sheet_music' | 'rehearsal_track' | 'other' | 'link',
      fileUrl,
      file: file instanceof File && file.size > 0 ? file : undefined,
    },
    user.id,
    ensemble.id
  );

  if (result.error) {
    return redirect(
      `/ensembles/${id}/songs/${songId}?uploadError=${encodeURIComponent(result.error)}`
    );
  }

  return redirect(`/ensembles/${id}/songs/${songId}`);
};
