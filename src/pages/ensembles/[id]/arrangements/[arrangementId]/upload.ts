import type { APIRoute } from 'astro';
import { getEnsembleBySlugOrId, getEnsembleMembership } from '@lib/ensemble';
import { canManageEnsemble } from '@lib/permissions';
import { addArrangementVersion, getArrangementById } from '@lib/arrangements';

export const POST: APIRoute = async ({ params, locals, request, redirect }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id, arrangementId } = params;
  if (!id || !arrangementId) return new Response('Not found', { status: 404 });

  const ensemble = await getEnsembleBySlugOrId(id);
  if (!ensemble) return new Response('Ensemble not found', { status: 404 });

  const arrangement = await getArrangementById(arrangementId);
  if (!arrangement || arrangement.ensembleId !== ensemble.id) {
    return new Response('Not found', { status: 404 });
  }

  if (arrangement.submittedBy !== user.id) {
    const membership = await getEnsembleMembership(ensemble.id, user.id);
    if (!canManageEnsemble(user, membership)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const file = formData.get('file');
  const result = await addArrangementVersion(arrangementId, user.id, {
    notes: (formData.get('notes') as string | null) ?? undefined,
    file: file instanceof File && file.size > 0 ? file : undefined,
  });

  if (result.error) {
    return redirect(
      `/ensembles/${id}/arrangements/${arrangementId}?uploadError=${encodeURIComponent(result.error)}`
    );
  }

  return redirect(`/ensembles/${id}/arrangements/${arrangementId}`);
};
