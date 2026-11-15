import { missingEnv } from "./env.ts";

// Loaded with `node --import` ahead of the server (see Dockerfile), so a misconfigured deploy
// fails at start instead of on the first request that needs the missing variable.
const missing = missingEnv(process.env);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
