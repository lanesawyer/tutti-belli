import { getActionContext } from "astro:actions";
import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { securityHeaders } from "./lib/security-headers";
import { getSession, getSessionUser } from "./lib/session";
import { resolveViewAs, VIEW_AS_COOKIE } from "./lib/view-as";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/logout",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/invite/join",
  "/verify-email",
  "/verify-email-change",
  "/resend-verification",
  "/health",
];

// Check if a path matches any public route
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route === "/") {
      return pathname === "/";
    }
    return (
      pathname === route || pathname.startsWith(route + "/") || pathname.startsWith(route + "?")
    );
  });
}

const authenticate = async (context: APIContext, next: MiddlewareNext): Promise<Response> => {
  const sessionId = context.cookies.get("session")?.value;
  const session = getSession(sessionId);
  const user = await getSessionUser(session);

  context.locals.session = user ? session : null;
  context.locals.user = user;
  context.locals.viewingAs = null;

  // A site admin viewing the site as another user: serve the request as that user.
  const viewAsToken = context.cookies.get(VIEW_AS_COOKIE)?.value;
  if (viewAsToken) {
    const viewedUser = user ? await resolveViewAs(viewAsToken, user) : null;
    if (user && viewedUser) {
      context.locals.viewingAs = { realUser: user };
      context.locals.user = viewedUser;
    } else {
      context.cookies.delete(VIEW_AS_COOKIE, { path: "/" });
    }
  }

  // Redirect to login if accessing protected route without authentication
  if (!user && !isPublicRoute(context.url.pathname)) {
    return context.redirect(`/login?redirect=${encodeURIComponent(context.url.pathname)}`);
  }

  try {
    const { action, setActionResult, serializeActionResult } = getActionContext(context);
    if (action?.calledFrom === "form") {
      const result = await action.handler();
      // Astro turns an unexpected throw in an action into this error without logging it.
      if (result.error?.code === "INTERNAL_SERVER_ERROR") {
        console.error(`Action ${action.name} failed:`, result.error.message);
      }
      setActionResult(action.name, serializeActionResult(result));
    }
    return await next();
  } catch (error) {
    // Astro logs the error and renders the 500 page, but its log leaves out the request.
    console.error(`${context.request.method} ${context.url.pathname} failed:`, error);
    throw error;
  }
};

const SECURITY_HEADERS = Object.entries(securityHeaders(import.meta.env.PROD));

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await authenticate(context, next);
  for (const [name, value] of SECURITY_HEADERS) {
    // A route's own value wins, e.g. /files allows same-origin framing for the PDF embed.
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
});
