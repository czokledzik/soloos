import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse the connection across dev hot reloads.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
// The build doesn't query the database (every page is dynamic), so a missing URL
// (e.g. Vercel preview builds) must not crash at import; queries fail at runtime instead.
const url = process.env.DATABASE_URL ?? "";
const options = {
  max: process.env.VERCEL ? 3 : 10,
  // Neon's pooled endpoint (PgBouncer, transaction mode) can't use prepared statements.
  prepare: !url.includes("-pooler."),
};
const client = globalForDb.sql ?? (url ? postgres(url, options) : postgres(options));
if (process.env.NODE_ENV !== "production") globalForDb.sql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export * from "./schema";
