import { defineMiddleware } from 'astro:middleware';
import { auth } from './lib/auth';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/invite/join',
  '/resend-verification',
  '/verify-email',
  '/api/auth',
  '/_actions',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => {
    if (route === '/') return pathname === '/';
    return pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route + '?');
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const session = await auth.api.getSession({ headers: context.request.headers });

  context.locals.session = session?.session ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = session?.user as any;
  context.locals.user = u
    ? {
        ...u,
        image: u.image ?? null,
        role: u.role ?? 'user',
        avatarUrl: u.avatarUrl ?? null,
        phone: u.phone ?? null,
      }
    : null;

  if (!session?.user && !isPublicRoute(context.url.pathname)) {
    return context.redirect(`/login?redirect=${encodeURIComponent(context.url.pathname)}`);
  }

  return next();
});
