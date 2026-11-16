import { describe, expect, it } from "vitest";
import { securityHeaders } from "@lib/security-headers";

function directives(production = false) {
  const policy = securityHeaders(production)["Content-Security-Policy-Report-Only"];
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

  it("only reports CSP violations and never enforces", () => {
    expect(securityHeaders(true)).not.toHaveProperty("Content-Security-Policy");
  });

  it("allows exactly the origins the app loads from", () => {
    expect(directives()).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "https://cdnjs.cloudflare.com"],
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

  it("allows no inline scripts or styles", () => {
    expect(securityHeaders(false)["Content-Security-Policy-Report-Only"]).not.toMatch(
      /'unsafe-inline'|'unsafe-eval'/,
    );
  });
});
