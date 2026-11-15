import { createContext } from "astro/middleware";
import type { APIContext } from "astro";
import { ACTION_API_CONTEXT_SYMBOL } from "./astro-actions.ts";

export const SITE_URL = "http://localhost:4321";

export type FieldValue = string | number | File | string[];
export type Fields = Record<string, FieldValue | undefined>;

export type ActionResult = {
  data: unknown;
  error: { code: string; message: string; type: string } | undefined;
};

type CallableAction = (this: APIContext, input: FormData) => Promise<ActionResult>;

export function toFormData(fields: Fields): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) form.append(name, item);
    } else if (value instanceof File) {
      form.append(name, value);
    } else {
      form.append(name, String(value));
    }
  }
  return form;
}

/**
 * A real Astro API context (real cookie jar, URL and redirect helper) for a request that never
 * went through a server. `locals` is whatever the middleware would have left there.
 */
export function createTestContext(
  options: {
    path?: string;
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    locals?: Partial<App.Locals>;
  } = {},
): APIContext {
  const headers = new Headers(options.headers);
  const cookies = Object.entries(options.cookies ?? {});
  if (cookies.length > 0) {
    headers.set("cookie", cookies.map(([name, value]) => `${name}=${value}`).join("; "));
  }
  const request = new Request(new URL(options.path ?? "/", SITE_URL), {
    method: options.method ?? "GET",
    headers,
  });
  return createContext({
    request,
    defaultLocale: "",
    clientAddress: "127.0.0.1",
    locals: { session: null, user: null, viewingAs: null, ...options.locals },
  });
}

/**
 * Runs an action the way a form POST does: the fields go through the action's own zod schema
 * and the handler gets the context, with thrown ActionErrors returned as `error`.
 */
export async function callAction(
  action: unknown,
  fields: Fields,
  options: {
    user?: App.Locals["user"];
    viewingAs?: App.Locals["viewingAs"];
    headers?: Record<string, string>;
  } = {},
) {
  const context = createTestContext({
    method: "POST",
    headers: options.headers,
    locals: { user: options.user ?? null, viewingAs: options.viewingAs ?? null },
  });
  Reflect.set(context, ACTION_API_CONTEXT_SYMBOL, true);
  const result = await (action as CallableAction).call(context, toFormData(fields));
  return { ...result, context };
}
