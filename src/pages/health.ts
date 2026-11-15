import type { APIRoute } from "astro";
import { databaseIsUp } from "@lib/health";

export const GET: APIRoute = async () => {
  const up = await databaseIsUp();
  return Response.json({ status: up ? "ok" : "unavailable" }, { status: up ? 200 : 503 });
};
