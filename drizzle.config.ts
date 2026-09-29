import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  // Migrations need a direct (unpooled) connection when running against Neon.
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)! },
});
