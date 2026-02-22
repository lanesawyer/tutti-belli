import { defineMiddleware } from 'astro:middleware';
import { getSession, getUserFromSession } from './lib/session';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/invite/join',
];

// Check if a path matches any public route
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => {
    if (route === '/') {
      return pathname === '/';
    }
    return pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route + '?');
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const sessionId = context.cookies.get('session')?.value;
  const session = getSession(sessionId);
  const user = await getUserFromSession(sessionId);

  context.locals.session = session;
  context.locals.user = user;

  // Redirect to login if accessing protected route without authentication
  if (!user && !isPublicRoute(context.url.pathname)) {
    return context.redirect(`/login?redirect=${encodeURIComponent(context.url.pathname)}`);
  }

  return next();
});

