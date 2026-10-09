import { sql } from "drizzle-orm";
import { db, organizations, projects, tasks } from "@/db";

/** Empties every table (and resets ids) so each test starts from a clean database. */
export async function resetDb() {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

/** FormData from a plain object; null/undefined values are skipped. */
export function form(values: Record<string, string | number | boolean | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null) fd.set(k, String(v));
  return fd;
}

export async function makeOrg(values: Partial<typeof organizations.$inferInsert> = {}) {
  const [org] = await db
    .insert(organizations)
    .values({ name: "Acme", status: "active", ...values })
    .returning();
  return org;
}

export async function makeProject(values: Partial<typeof projects.$inferInsert> = {}) {
  const orgId = values.orgId ?? (await makeOrg()).id;
  const [project] = await db
    .insert(projects)
    .values({ name: "Website", pricing: "hourly", hourlyRate: 150_00, ...values, orgId })
    .returning();
  return project;
}

export async function makeTask(values: Partial<typeof tasks.$inferInsert> = {}) {
  const projectId = values.projectId ?? (await makeProject()).id;
  const [task] = await db
    .insert(tasks)
    .values({ title: "Do the thing", ...values, projectId })
    .returning();
  return task;
}

/** Unwraps an ActionResult, failing the test with the action's error message. */
export function ok<T>(res: { ok: true; data?: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(`Action failed: ${res.error}`);
  return res.data as T;
}
