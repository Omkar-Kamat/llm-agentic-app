import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const isLocal =
  env.DATABASE_URL.includes("localhost") ||
  env.DATABASE_URL.includes("127.0.0.1");

export const client = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: isLocal ? false : "require",
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
});
export const db = drizzle(client, { schema });
