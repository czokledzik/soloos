import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse the connection across dev hot reloads.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
const url = process.env.DATABASE_URL!;
const client =
  globalForDb.sql ??
  postgres(url, {
    max: process.env.VERCEL ? 3 : 10,
    // Neon's pooled endpoint (PgBouncer, transaction mode) can't use prepared statements.
    prepare: !url.includes("-pooler."),
  });
if (process.env.NODE_ENV !== "production") globalForDb.sql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export * from "./schema";
