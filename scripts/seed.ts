// Seeds the "Personal" internal client and a SoloOS project. Safe to re-run: skips if already present.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema, casing: "snake_case" });

async function main() {
  const existing = await db.query.organizations.findFirst({
    where: eq(schema.organizations.name, "Personal"),
  });
  if (existing) {
    console.log("Already seeded.");
    return;
  }
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Personal", kind: "person", status: "internal", notesMd: "Personal and side projects." })
    .returning();
  const [project] = await db
    .insert(schema.projects)
    .values({ orgId: org.id, name: "SoloOS", pricing: "none", contractType: "internal", status: "active" })
    .returning();
  const todo = [
    "M4: Pipeline, quick-add lead, interactions, client timeline",
    "M5: Reports + CSV export",
    "M5: Import Clockify and Linear CSV exports",
    "Nightly pg_dump backup (launchd)",
  ];
  await db.insert(schema.tasks).values([
    ...todo.map((title, i) => ({ projectId: project.id, title, status: "todo" as const, sortOrder: (i + 1) * 1000 })),
    { projectId: project.id, title: "M1–M3: scaffold, projects, tasks, timer", status: "done", sortOrder: 1000, completedAt: new Date() },
  ]);
  console.log(`Seeded "Personal" / "SoloOS" (project ${project.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
