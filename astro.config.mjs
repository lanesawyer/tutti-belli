// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import path from "path";

// Server code reads secrets from process.env at runtime, never import.meta.env, because Vite
// writes import.meta.env values into the build. Load .env here so `astro dev` sees them;
// variables already in the environment win.
try {
  process.loadEnvFile();
} catch {
  // no .env file (CI, Docker)
}

// A PR preview's exact hostname, passed as a Docker build arg because the allowed hosts are
// fixed at build time. Never a wildcard: Fly app names are first come, first served.
const previewHostname = process.env.PREVIEW_HOSTNAME?.trim();
if (previewHostname && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(previewHostname)) {
  throw new Error(`PREVIEW_HOSTNAME must be a plain hostname, got "${previewHostname}"`);
}

// https://astro.build/config
export default defineConfig({
  site: "https://tuttibelli.org",
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  security: {
    // Fly terminates TLS, so the server sees plain http. Trusting X-Forwarded-Proto/Host for
    // these hosts lets Astro rebuild the real https URL, which its CSRF origin check
    // (checkOrigin, on by default) compares against the browser's Origin header.
    allowedDomains: [
      { hostname: "tuttibelli.org", protocol: "https" },
      { hostname: "*.tuttibelli.org", protocol: "https" },
      { hostname: "tutti-belli.fly.dev", protocol: "https" },
      ...(previewHostname ? [{ hostname: previewHostname, protocol: "https" }] : []),
    ],
  },
  vite: {
    // Keeps Astro from inlining small scripts into the HTML, which the Content Security Policy blocks.
    build: { assetsInlineLimit: 0 },
    resolve: {
      alias: {
        "@db": path.resolve("./db/index.ts"),
        "@actions": path.resolve("./src/actions"),
        "@components": path.resolve("./src/components"),
        "@containers": path.resolve("./src/containers"),
        "@layouts": path.resolve("./src/layouts"),
        "@lib": path.resolve("./src/lib"),
      },
    },
  },
});
