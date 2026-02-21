import { defineMiddleware } from 'astro:middleware';
import { getSession, getUserFromSession } from './lib/session';

export const onRequest = defineMiddleware(async (context, next) => {
  const sessionId = context.cookies.get('session')?.value;
  const session = getSession(sessionId);
  const user = await getUserFromSession(sessionId);

  context.locals.session = session;
  context.locals.user = user;

  return next();
});
