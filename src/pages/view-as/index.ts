import type { APIRoute } from 'astro';
import { isSiteAdmin } from '@lib/permissions';
import { getSandboxEnsemble, getTestAccount, VIEW_AS_COOKIE } from '@lib/role-preview';
import { createViewAsToken } from '@lib/session';
import { getEnsembleUrlId } from '@lib/slug';

// Start previewing as a test account, or switch to another one mid-preview.
export const POST: APIRoute = async ({ locals, request, cookies, redirect }) => {
  const admin = locals.viewingAs?.realUser ?? locals.user;
  if (!admin || !isSiteAdmin(admin)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData().catch(() => null);
  const account = getTestAccount(String(form?.get('userId') ?? ''));
  const sandbox = await getSandboxEnsemble();
  if (!account || !sandbox) return new Response('Not found', { status: 404 });

  cookies.set(VIEW_AS_COOKIE, createViewAsToken(admin.id, account.id), {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 60,
  });

  return redirect(account.membership ? `/ensembles/${getEnsembleUrlId(sandbox)}` : '/ensembles');
};
