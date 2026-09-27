import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse the connection across dev hot reloads.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
const client = globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.sql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export * from "./schema";
