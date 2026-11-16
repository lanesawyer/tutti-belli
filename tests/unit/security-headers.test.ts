import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { securityHeaders, THEME_SCRIPT_HASH } from "@lib/security-headers";

function directives() {
  const policy = securityHeaders(true)["Content-Security-Policy"];
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

describe("securityHeaders", () => {
  it("sends the always-on headers", () => {
    expect(securityHeaders(false)).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
  });

  it("sends HSTS only in a production build", () => {
    expect(securityHeaders(true)["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(securityHeaders(false)).not.toHaveProperty("Strict-Transport-Security");
  });

  it("turns off unused features but leaves the ones the app uses", () => {
    const policy = securityHeaders(false)["Permissions-Policy"];
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=()");
    for (const used of ["clipboard-write", "autoplay", "fullscreen", "encrypted-media"]) {
      expect(policy).not.toContain(used);
    }
  });

  it("enforces the CSP in a production build and only reports under astro dev", () => {
    expect(securityHeaders(true)).not.toHaveProperty("Content-Security-Policy-Report-Only");
    expect(securityHeaders(false)).not.toHaveProperty("Content-Security-Policy");
    expect(securityHeaders(false)["Content-Security-Policy-Report-Only"]).toBe(
      securityHeaders(true)["Content-Security-Policy"],
    );
  });

  it("allows exactly the origins the app loads from", () => {
    expect(directives()).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", THEME_SCRIPT_HASH],
      "style-src": ["'self'", "https://cdnjs.cloudflare.com"],
      "style-src-attr": ["'unsafe-inline'"],
      "font-src": ["https://cdnjs.cloudflare.com"],
      "img-src": ["'self'", "data:"],
      "media-src": ["'self'"],
      "object-src": ["'self'"],
      "frame-src": ["https://www.youtube.com"],
      "connect-src": ["'self'"],
      "form-action": ["'self'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("allows no inline scripts or <style> blocks, and no eval", () => {
    const { "style-src-attr": _styleAttributes, ...rest } = directives();
    expect(Object.values(rest).flat()).not.toContain("'unsafe-inline'");
    expect(Object.values(directives()).flat()).not.toContain("'unsafe-eval'");
  });

  it("hashes the theme script astro-bulma ships", () => {
    const source = readFileSync(
      "node_modules/astro-bulma/src/components/ThemeToggle.astro",
      "utf8",
    );
    const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)![1];
    const hash = createHash("sha256").update(script).digest("base64");
    expect(THEME_SCRIPT_HASH).toBe(`'sha256-${hash}'`);
  });
});
