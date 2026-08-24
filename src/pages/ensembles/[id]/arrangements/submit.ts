import type { APIRoute } from 'astro';
import { getEnsembleBySlugOrId, getEnsembleMembership } from '@lib/ensemble';
import { isSiteAdmin } from '@lib/permissions';
import { submitArrangement } from '@lib/arrangements';

export const POST: APIRoute = async ({ params, locals, request, redirect }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return new Response('Not found', { status: 404 });

  const ensemble = await getEnsembleBySlugOrId(id);
  if (!ensemble) return new Response('Ensemble not found', { status: 404 });

  const membership = await getEnsembleMembership(ensemble.id, user.id);
  if (!membership && !isSiteAdmin(user)) {
    return new Response('Forbidden', { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const file = formData.get('file');
  const result = await submitArrangement(ensemble.id, user.id, {
    title: (formData.get('title') as string | null) ?? '',
    composer: (formData.get('composer') as string | null) ?? undefined,
    arranger: (formData.get('arranger') as string | null) ?? undefined,
    notes: (formData.get('notes') as string | null) ?? undefined,
    file: file instanceof File && file.size > 0 ? file : undefined,
  });

  if (result.error) {
    return redirect(
      `/ensembles/${id}/arrangements?submitError=${encodeURIComponent(result.error)}`
    );
  }

  return redirect(`/ensembles/${id}/arrangements/${result.arrangementId}`);
};
