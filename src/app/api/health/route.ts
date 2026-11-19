import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  let dbStatus = "ok";
  let dbError: string | null = null;
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err: unknown) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : String(err);
  }

  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      db: dbStatus,
      ...(dbError ? { dbError } : {}),
    },
    { status: 200 }
  );
}

