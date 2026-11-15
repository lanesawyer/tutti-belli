// Report-only until the inline scripts, inline styles and on* handlers are moved into bundled
// files; the browser console lists what still violates it. External origins: Font Awesome's
// stylesheet and webfonts (cdnjs), YouTube embeds on song links. data: is the check-in QR code
// and legacy base64 images. object-src 'self' is the inline PDF <embed> from /files.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://cdnjs.cloudflare.com",
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
    "Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY,
    // Local dev is plain http, and HSTS there would stick to localhost in the browser.
    ...(production && { "Strict-Transport-Security": "max-age=31536000" }),
  };
}
