import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { resolveSiteUrl, getSiteUrl, siteLink } from "../../src/lib/site-url.ts";

describe("resolveSiteUrl", () => {
  it("prefers SITE_URL in production and in dev", () => {
    expect(
      resolveSiteUrl({
        siteUrl: "https://tutti-belli-pr-9.fly.dev",
        prod: true,
        site: "https://tuttibelli.org",
      }),
    ).toBe("https://tutti-belli-pr-9.fly.dev");
    expect(resolveSiteUrl({ siteUrl: "http://192.168.1.5:4321", prod: false })).toBe(
      "http://192.168.1.5:4321",
    );
  });

  it("falls back to the configured site in a production build", () => {
    expect(resolveSiteUrl({ siteUrl: undefined, prod: true, site: "https://tuttibelli.org" })).toBe(
      "https://tuttibelli.org",
    );
    expect(resolveSiteUrl({ siteUrl: "  ", prod: true, site: "https://tuttibelli.org/" })).toBe(
      "https://tuttibelli.org",
    );
  });

  it("falls back to localhost in dev, even though site is configured", () => {
    expect(
      resolveSiteUrl({ siteUrl: undefined, prod: false, site: "https://tuttibelli.org" }),
    ).toBe("http://localhost:4321");
  });

  it("reduces the value to an origin", () => {
    expect(resolveSiteUrl({ siteUrl: "https://tuttibelli.org/some/path?x=1", prod: true })).toBe(
      "https://tuttibelli.org",
    );
  });

  it("rejects missing, malformed and non-http values", () => {
    expect(() => resolveSiteUrl({ prod: true })).toThrow();
    expect(() => resolveSiteUrl({ siteUrl: "tuttibelli.org", prod: true })).toThrow();
    expect(() => resolveSiteUrl({ siteUrl: "javascript:alert(1)", prod: true })).toThrow();
  });
});

describe("getSiteUrl / siteLink", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads SITE_URL from process.env at call time", () => {
    vi.stubEnv("SITE_URL", "https://example.tuttibelli.org");
    expect(getSiteUrl()).toBe("https://example.tuttibelli.org");
    vi.stubEnv("SITE_URL", "https://tuttibelli.org");
    expect(getSiteUrl()).toBe("https://tuttibelli.org");
  });

  it("defaults to localhost outside a production build", () => {
    vi.stubEnv("SITE_URL", "");
    expect(getSiteUrl()).toBe("http://localhost:4321");
  });

  it("builds absolute links with encoded query parameters", () => {
    vi.stubEnv("SITE_URL", "https://tuttibelli.org");
    expect(siteLink("/reset-password", { token: "a&b=c" })).toBe(
      "https://tuttibelli.org/reset-password?token=a%26b%3Dc",
    );
    expect(() => siteLink("//evil.example/x")).toThrow();
  });
});

describe("request-derived links", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|astro)$/.test(name) ? [full] : [];
    });
  }

  it("no source file builds a link from the request origin", () => {
    const offenders = sourceFiles(path.resolve("src")).filter((file) =>
      /\b(?:Astro|context)\.url\.(?:origin|host|hostname)\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
