// External origins: Font Awesome's stylesheet and webfonts (cdnjs), YouTube embeds on song
// links. data: is the check-in QR code and legacy base64 images. object-src 'self' is the inline
// PDF <embed> from /files. style="" attributes are allowed; <style> blocks and inline scripts
// are not, apart from the one hashed below.

// astro-bulma's ThemeToggle sets the theme in an inline script before first paint. The hash is of
// that script's exact text, so an astro-bulma upgrade that changes it fails the unit test.
export const THEME_SCRIPT_HASH = "'sha256-3p42Aq0ScRMZYambKLm//OwMSEm182VepcyPM4n+jzI='";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${THEME_SCRIPT_HASH}`,
  "style-src 'self' https://cdnjs.cloudflare.com",
  "style-src-attr 'unsafe-inline'",
  "font-src https://cdnjs.cloudflare.com",
  "img-src 'self' data:",
  "media-src 'self'",
  "object-src 'self'",
  "frame-src https://www.youtube.com",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(production: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    // Clipboard, autoplay, fullscreen and the sensors stay on: the copy buttons and the YouTube
    // embed's allow= list use them.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // Enforced only in a build: astro dev injects inline scripts and styles of its own.
    [production ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]:
      CONTENT_SECURITY_POLICY,
    // Local dev is plain http, and HSTS there would stick to localhost in the browser.
    ...(production && { "Strict-Transport-Security": "max-age=31536000" }),
  };
}
