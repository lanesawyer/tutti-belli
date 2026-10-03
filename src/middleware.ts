import { defineMiddleware } from 'astro:middleware';
import { getSession, getUserFromSession } from './lib/session';
import { resolveViewAs, VIEW_AS_COOKIE } from './lib/role-preview';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/invite/join',
  '/verify-email',
  '/verify-email-change',
  '/resend-verification',
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
  context.locals.viewingAs = null;

  // A site admin previewing a role: serve the request as the test account they picked.
  const viewAsToken = context.cookies.get(VIEW_AS_COOKIE)?.value;
  if (viewAsToken) {
    const testAccount = user ? await resolveViewAs(viewAsToken, user) : null;
    if (user && testAccount) {
      context.locals.viewingAs = { realUser: user };
      context.locals.user = testAccount;
    } else {
      context.cookies.delete(VIEW_AS_COOKIE, { path: '/' });
    }
  }

  // Redirect to login if accessing protected route without authentication
  if (!user && !isPublicRoute(context.url.pathname)) {
    return context.redirect(`/login?redirect=${encodeURIComponent(context.url.pathname)}`);
  }

  return next();
});

