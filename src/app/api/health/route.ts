import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  let dbStatus = "ok";
  let dbError: string | null = null;
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err: unknown) {
    dbStatus = "error";
    const cause = (err as { cause?: unknown })?.cause;
    const causeMsg = cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null ? JSON.stringify(cause) : String(cause);
    dbError = `${err instanceof Error ? err.message : String(err)} | cause: ${causeMsg}`;
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

