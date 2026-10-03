import type { APIRoute } from 'astro';
import { VIEW_AS_COOKIE } from '@lib/role-preview';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(VIEW_AS_COOKIE, { path: '/' });
  return redirect('/admin#role-preview');
};
