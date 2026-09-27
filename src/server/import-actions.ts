"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, organizations, projects, tasks, timeEntries } from "@/db";
import { toDateString } from "@/lib/format";
import { ActionError, int, run, str } from "./form";
import { parseClockify, parseLinear, type DateOrder } from "./importers";
import { refreshAll } from "./refresh";

export type ImportSummary = {
  dryRun: boolean;
  rows: number;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
  info: string[];
  newClients: string[];
  newProjects: string[];
  newTasks: number;
  from?: string;
  to?: string;
  hours?: number;
};

const norm = (s: string) => s.trim().toLowerCase();

async function readFile(fd: FormData): Promise<string> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose a CSV file");
  return file.text();
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Finds or plans/creates orgs and projects by (case-insensitive) name.
 * In dry-run mode nothing is written; ids for new records are negative placeholders.
 */
function makeResolver(tx: Tx, dryRun: boolean, summary: ImportSummary) {
  const orgCache = new Map<string, number>();
  const projectCache = new Map<string, number>();
  let placeholder = -1;

  return {
    async org(name: string, status: "active" | "internal" = "active"): Promise<number> {
      const key = norm(name);
      const cached = orgCache.get(key);
      if (cached) return cached;
      const all = await tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(isNull(organizations.archivedAt));
      const found = all.find((o) => norm(o.name) === key);
      let id: number;
      if (found) id = found.id;
      else {
        summary.newClients.push(name);
        id = dryRun
          ? placeholder--
          : (await tx.insert(organizations).values({ name, status }).returning({ id: organizations.id }))[0].id;
      }
      orgCache.set(key, id);
      return id;
    },
    async project(
      orgId: number,
      name: string,
      orgLabel: string,
      opts: { rate?: number | null; internal?: boolean } = {},
    ): Promise<number> {
      const key = `${orgId}|${norm(name)}`;
      const cached = projectCache.get(key);
      if (cached) return cached;
      let id: number | undefined;
      if (orgId > 0) {
        const list = await tx
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(eq(projects.orgId, orgId));
        id = list.find((p) => norm(p.name) === norm(name))?.id;
      }
      if (!id) {
        summary.newProjects.push(`${orgLabel} · ${name}`);
        id = dryRun
          ? placeholder--
          : (
              await tx
                .insert(projects)
                .values({
                  orgId,
                  name,
                  pricing: opts.internal ? "none" : "hourly",
                  hourlyRate: opts.rate ?? null,
                  status: "active",
                })
                .returning({ id: projects.id })
            )[0].id;
      }
      projectCache.set(key, id);
      return id;
    },
  };
}

class DryRunRollback extends Error {}

/** Runs the import in a transaction; in dry-run mode it is rolled back after counting. */
async function inTransaction(dryRun: boolean, fn: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      if (dryRun) throw new DryRunRollback();
    });
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }
}

// ---------- Clockify ----------

export async function importClockify(fd: FormData) {
  return run(async (): Promise<ImportSummary> => {
    const dryRun = str(fd, "dryRun") === "1";
    const order = (str(fd, "dateOrder") ?? "auto") as DateOrder;
    const { items, errors, info } = parseClockify(await readFile(fd), order);
    const summary: ImportSummary = {
      dryRun,
      rows: items.length + errors.length,
      imported: 0,
      duplicates: 0,
      skipped: errors.length,
      errors: errors.slice(0, 20),
      info,
      newClients: [],
      newProjects: [],
      newTasks: 0,
    };
    if (items.length === 0) return summary;

    const sorted = [...items].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    summary.from = toDateString(sorted[0].startedAt);
    summary.to = toDateString(sorted.at(-1)!.startedAt);

    const existing = new Set(
      (
        await db
          .select({ key: timeEntries.importKey })
          .from(timeEntries)
          .where(inArray(timeEntries.importKey, items.map((i) => i.importKey)))
      ).map((r) => r.key),
    );
    const fresh = items.filter((i) => !existing.has(i.importKey));
    summary.duplicates = items.length - fresh.length;
    summary.hours = Math.round((fresh.reduce((s, i) => s + i.durationMin, 0) / 60) * 10) / 10;

    await inTransaction(dryRun, async (tx) => {
      const resolve = makeResolver(tx, dryRun, summary);
      const taskCache = new Map<string, number>();
      for (const item of fresh) {
        const orgName = item.client || "Personal";
        const orgId = await resolve.org(orgName, item.client ? "active" : "internal");
        const projectId = await resolve.project(orgId, item.project, orgName, {
          rate: item.rate,
          internal: !item.client,
        });

        let taskId: number | null = null;
        if (item.task) {
          const key = `${projectId}|${norm(item.task)}`;
          taskId = taskCache.get(key) ?? null;
          if (taskId == null) {
            const found =
              projectId > 0
                ? await tx.query.tasks.findFirst({ where: and(eq(tasks.projectId, projectId), eq(tasks.title, item.task)) })
                : undefined;
            if (found) taskId = found.id;
            else {
              summary.newTasks++;
              taskId = dryRun
                ? -1
                : (
                    await tx
                      .insert(tasks)
                      .values({ projectId, title: item.task, status: "done", completedAt: item.endedAt })
                      .returning({ id: tasks.id })
                  )[0].id;
            }
            taskCache.set(key, taskId);
          }
        }

        if (!dryRun) {
          await tx
            .insert(timeEntries)
            .values({
              projectId,
              taskId,
              startedAt: item.startedAt,
              endedAt: item.endedAt,
              durationMin: item.durationMin,
              note: item.note,
              billable: item.billable,
              rateSnapshot: item.billable ? item.rate : null,
              importKey: item.importKey,
            })
            .onConflictDoNothing({ target: timeEntries.importKey });
        }
        summary.imported++;
      }
    });

    if (!dryRun) refreshAll();
    return summary;
  });
}

// ---------- Linear ----------

export async function importLinear(fd: FormData) {
  return run(async (): Promise<ImportSummary> => {
    const dryRun = str(fd, "dryRun") === "1";
    const orgId = int(fd, "orgId");
    if (!orgId) throw new ActionError("Pick the client these issues belong to");
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    if (!org) throw new ActionError("Client not found");
    const includeCanceled = str(fd, "includeCanceled") === "on";

    const { items, errors, info } = parseLinear(await readFile(fd));
    const wanted = items.filter((i) => includeCanceled || !i.canceled);
    const summary: ImportSummary = {
      dryRun,
      rows: items.length + errors.length,
      imported: 0,
      duplicates: 0,
      skipped: items.length - wanted.length + errors.length,
      errors,
      info: [...info, ...(items.length !== wanted.length ? [`${items.length - wanted.length} canceled issues skipped`] : [])],
      newClients: [],
      newProjects: [],
      newTasks: 0,
    };
    if (wanted.length === 0) return summary;

    const existing = new Set(
      (
        await db
          .select({ key: tasks.importKey })
          .from(tasks)
          .where(inArray(tasks.importKey, wanted.map((i) => i.importKey)))
      ).map((r) => r.key),
    );
    const fresh = wanted.filter((i) => !existing.has(i.importKey));
    summary.duplicates = wanted.length - fresh.length;

    await inTransaction(dryRun, async (tx) => {
      const resolve = makeResolver(tx, dryRun, summary);
      for (const [i, item] of fresh.entries()) {
        const projectId = await resolve.project(orgId, item.project, org.name, { internal: org.status === "internal" });
        if (!dryRun) {
          await tx
            .insert(tasks)
            .values({
              projectId,
              title: item.title,
              bodyMd: item.description,
              status: item.status,
              priority: item.priority,
              dueDate: item.dueDate,
              sortOrder: (i + 1) * 1000,
              completedAt: item.status === "done" ? (item.completedAt ?? new Date()) : null,
              importKey: item.importKey,
              ...(item.createdAt ? { createdAt: item.createdAt } : {}),
            })
            .onConflictDoNothing({ target: tasks.importKey });
        }
        summary.imported++;
        summary.newTasks++;
      }
    });

    if (!dryRun) refreshAll();
    return summary;
  });
}
