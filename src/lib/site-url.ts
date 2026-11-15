const DEV_SITE_URL = "http://localhost:4321";

/**
 * Links in emails and other content that leaves the site must not come from the request: the
 * Host and X-Forwarded-Host headers are client-supplied. SITE_URL is read at runtime so a
 * preview can point at itself; production falls back to `site` from astro.config.mjs.
 */
export function resolveSiteUrl(options: {
  siteUrl?: string;
  prod: boolean;
  site?: string;
}): string {
  const configured = options.siteUrl?.trim() || (options.prod ? options.site : DEV_SITE_URL);
  if (!configured) {
    throw new Error("SITE_URL is not set and astro.config.mjs has no site.");
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${configured}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`SITE_URL must be an http(s) URL: ${configured}`);
  }
  return url.origin;
}

export function getSiteUrl(): string {
  return resolveSiteUrl({
    siteUrl: process.env.SITE_URL,
    prod: import.meta.env.PROD,
    site: import.meta.env.SITE,
  });
}

/** An absolute link to `path` on the site, with `params` added to the query string. */
export function siteLink(path: string, params: Record<string, string> = {}): string {
  const base = getSiteUrl();
  const url = new URL(path, base);
  if (url.origin !== base) throw new Error(`Link path leaves the site: ${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
