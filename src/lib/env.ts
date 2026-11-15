type Env = Record<string, string | undefined>;

/** The variables the server cannot run without, given which services are turned off. */
export function missingEnv(env: Env): string[] {
  const missing: string[] = [];
  if (!env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!env.DATABASE_URL) {
    if (!env.ASTRO_DB_REMOTE_URL) {
      missing.push("DATABASE_URL (or ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN)");
    } else if (!env.ASTRO_DB_APP_TOKEN) {
      missing.push("ASTRO_DB_APP_TOKEN");
    }
  }
  if (!env.EMAIL_DISABLED) {
    for (const name of ["EMAIL_API_KEY", "EMAIL_FROM"]) if (!env[name]) missing.push(name);
  }
  if (!env.STORAGE_DISABLED) {
    for (const name of ["AWS_ENDPOINT_URL_S3", "BUCKET_NAME"]) if (!env[name]) missing.push(name);
  }
  return missing;
}
