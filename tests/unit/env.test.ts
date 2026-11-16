import { describe, it, expect } from "vitest";
import { missingEnv } from "../../src/lib/env.ts";

const PRODUCTION = {
  JWT_SECRET: "secret",
  ASTRO_DB_REMOTE_URL: "libsql://tutti-belli.turso.io",
  ASTRO_DB_APP_TOKEN: "token",
  EMAIL_API_KEY: "re_key",
  EMAIL_FROM: "noreply@tuttibelli.org",
  AWS_ENDPOINT_URL_S3: "https://fly.storage.tigris.dev",
  BUCKET_NAME: "tutti-belli",
};

describe("missingEnv", () => {
  it("accepts a full production config", () => {
    expect(missingEnv(PRODUCTION)).toEqual([]);
  });

  it("lists every missing variable", () => {
    expect(missingEnv({})).toEqual([
      "JWT_SECRET",
      "DATABASE_URL (or ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN)",
      "EMAIL_API_KEY",
      "EMAIL_FROM",
      "AWS_ENDPOINT_URL_S3",
      "BUCKET_NAME",
    ]);
  });

  it("treats empty values as missing", () => {
    expect(missingEnv({ ...PRODUCTION, JWT_SECRET: "", EMAIL_FROM: "" })).toEqual([
      "JWT_SECRET",
      "EMAIL_FROM",
    ]);
  });

  it("needs the Turso token with a remote database URL", () => {
    expect(missingEnv({ ...PRODUCTION, ASTRO_DB_APP_TOKEN: undefined })).toEqual([
      "ASTRO_DB_APP_TOKEN",
    ]);
  });

  it("needs no Turso variables with DATABASE_URL", () => {
    const env = { ...PRODUCTION, ASTRO_DB_REMOTE_URL: "", ASTRO_DB_APP_TOKEN: "" };
    expect(missingEnv({ ...env, DATABASE_URL: "file:local.db" })).toEqual([]);
  });

  it("needs no email or storage variables when those are disabled, as in a PR preview", () => {
    expect(
      missingEnv({
        JWT_SECRET: "secret",
        DATABASE_URL: "file:local.db",
        EMAIL_DISABLED: "true",
        STORAGE_DISABLED: "true",
      }),
    ).toEqual([]);
  });
});
