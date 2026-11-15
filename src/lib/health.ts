import { db, sql } from "@db";

export async function databaseIsUp(): Promise<boolean> {
  try {
    await db.run(sql`select 1`);
    return true;
  } catch (error) {
    console.error("Health check: database query failed", error);
    return false;
  }
}
