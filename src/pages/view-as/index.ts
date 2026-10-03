import type { APIRoute } from 'astro';
import { getUserById } from '@lib/admin';
import { safeRedirectPath } from '@lib/redirect';
import { createViewAsToken } from '@lib/session';
import { canViewAs, VIEW_AS_COOKIE } from '@lib/view-as';

// Start viewing the site as another user, or switch to someone else mid-session.
export const POST: APIRoute = async ({ locals, request, cookies, redirect }) => {
  const admin = locals.viewingAs?.realUser ?? locals.user;
  const form = await request.formData().catch(() => null);
  const target = await getUserById(String(form?.get('userId') ?? ''));
  if (!admin || !target || !canViewAs(admin, target)) return new Response('Forbidden', { status: 403 });

  cookies.set(VIEW_AS_COOKIE, createViewAsToken(admin.id, target.id), {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 60,
  });
  console.log(`[view-as] ${admin.email} started viewing as ${target.email}`);

  return redirect(safeRedirectPath(String(form?.get('returnTo') ?? '')) ?? '/ensembles');
};
