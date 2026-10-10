"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import {
  changeRequestStatus,
  changeRequests,
  db,
  decisions,
  docPages,
  docRevisions,
  projects,
  systemKind,
  systems,
} from "@/db";
import { parseDuration, toDateString } from "@/lib/format";
import { findSecret } from "@/lib/secrets";
import { ActionError, int, money, oneOf, reqStr, run, str } from "./form";
import { refreshAll } from "./refresh";

/** Saves to a page within this window update its latest revision instead of adding one. */
const REVISION_WINDOW_MS = 10 * 60_000;

function noSecrets(...values: (string | null)[]) {
  for (const v of values) {
    const what = findSecret(v);
    if (what) throw new ActionError(`That looks like ${what}. Keep credentials in a password manager, not in SoloOS.`);
  }
}

// ---------- Brief and scope ----------

export async function updateProjectBrief(id: number, briefMd: string) {
  return run(async () => {
    noSecrets(briefMd);
    await db.update(projects).set({ briefMd }).where(eq(projects.id, id));
    refreshAll();
  });
}

export async function updateProjectScope(id: number, scopeMd: string) {
  return run(async () => {
    noSecrets(scopeMd);
    await db.update(projects).set({ scopeMd }).where(eq(projects.id, id));
    refreshAll();
  });
}

/** Marks the current scope as agreed. Later changes go through change requests. */
export async function baselineScope(id: number) {
  return run(async () => {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    if (!project) throw new ActionError("Project not found");
    if (!project.scopeMd.trim()) throw new ActionError("Write the scope first");
    await db.transaction(async (tx) => {
      await tx.update(projects).set({ scopeBaselinedAt: new Date() }).where(eq(projects.id, id));
      await tx.insert(decisions).values({
        projectId: id,
        decidedOn: toDateString(new Date()),
        title: "Scope baselined",
        detailsMd: project.scopeMd,
      });
    });
    refreshAll();
  });
}

// ---------- Decisions ----------

export async function saveDecision(id: number | null, fd: FormData) {
  return run(async () => {
    const values = {
      decidedOn: str(fd, "decidedOn") ?? toDateString(new Date()),
      title: reqStr(fd, "title"),
      detailsMd: str(fd, "detailsMd") ?? "",
      decidedBy: str(fd, "decidedBy"),
      sourceNote: str(fd, "sourceNote"),
      sourceMessageId: int(fd, "sourceMessageId"),
      sourceInteractionId: int(fd, "sourceInteractionId"),
    };
    noSecrets(values.title, values.detailsMd, values.sourceNote);
    if (id) {
      await db.update(decisions).set(values).where(eq(decisions.id, id));
    } else {
      const projectId = int(fd, "projectId");
      if (!projectId) throw new ActionError("Missing project");
      await db.insert(decisions).values({ projectId, ...values });
    }
    refreshAll();
  });
}

export async function deleteDecision(id: number) {
  return run(async () => {
    await db.delete(decisions).where(eq(decisions.id, id));
    refreshAll();
  });
}

// ---------- Change requests ----------

/** "2h", "-1:30", "+45m" → signed minutes. */
function signedDuration(input: string | null): number | null {
  if (!input) return null;
  const negative = input.trim().startsWith("-");
  const min = parseDuration(input.trim().replace(/^[-+]\s*/, ""));
  if (min == null) throw new ActionError(`Can't read "${input}" as hours (use e.g. 2h, -1:30, 45m)`);
  return negative ? -min : min;
}

export async function saveChangeRequest(id: number | null, fd: FormData) {
  return run(async () => {
    const values = {
      title: reqStr(fd, "title"),
      detailsMd: str(fd, "detailsMd") ?? "",
      requestedBy: str(fd, "requestedBy"),
      requestedOn: str(fd, "requestedOn") ?? toDateString(new Date()),
      hoursImpactMin: signedDuration(str(fd, "hoursImpact")),
      priceImpact: money(fd, "priceImpact"),
      sourceMessageId: int(fd, "sourceMessageId"),
    };
    noSecrets(values.title, values.detailsMd);
    if (id) {
      await db.update(changeRequests).set(values).where(eq(changeRequests.id, id));
    } else {
      const projectId = int(fd, "projectId");
      if (!projectId) throw new ActionError("Missing project");
      await db.insert(changeRequests).values({ projectId, ...values });
    }
    refreshAll();
  });
}

/** Approving or rejecting also records the decision in the log. */
export async function setChangeRequestStatus(id: number, status: (typeof changeRequestStatus.enumValues)[number]) {
  return run(async () => {
    if (!changeRequestStatus.enumValues.includes(status)) throw new ActionError("Bad status");
    await db.transaction(async (tx) => {
      const today = toDateString(new Date());
      const [cr] = await tx
        .update(changeRequests)
        .set({ status, decidedOn: status === "proposed" ? null : today })
        .where(eq(changeRequests.id, id))
        .returning();
      if (!cr) throw new ActionError("Change request not found");
      if (status !== "proposed") {
        await tx.insert(decisions).values({
          projectId: cr.projectId,
          decidedOn: today,
          title: `${status === "approved" ? "Approved" : "Rejected"} change: ${cr.title}`,
          detailsMd: cr.detailsMd,
          decidedBy: cr.requestedBy,
          sourceMessageId: cr.sourceMessageId,
        });
      }
    });
    refreshAll();
  });
}

export async function deleteChangeRequest(id: number) {
  return run(async () => {
    await db.delete(changeRequests).where(eq(changeRequests.id, id));
    refreshAll();
  });
}

// ---------- Doc pages ----------

export async function createDocPage(projectId: number, title: string) {
  return run(async () => {
    if (!title.trim()) throw new ActionError("Give the page a title");
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${docPages.sortOrder}), 0)` })
      .from(docPages)
      .where(eq(docPages.projectId, projectId));
    const [page] = await db
      .insert(docPages)
      .values({ projectId, title: title.trim(), sortOrder: Number(max) + 1000 })
      .returning({ id: docPages.id });
    refreshAll();
    return page.id;
  });
}

/**
 * Saves a page and records a revision. Quick successive saves fold into the
 * latest revision; a note (or a pause of 10+ minutes) starts a new one.
 */
export async function saveDocPage(id: number, input: { title: string; bodyMd: string; note?: string }) {
  return run(async () => {
    const title = input.title.trim();
    if (!title) throw new ActionError("Give the page a title");
    noSecrets(input.bodyMd);
    await db.transaction(async (tx) => {
      const page = await tx.query.docPages.findFirst({ where: eq(docPages.id, id) });
      if (!page) throw new ActionError("Page not found");
      if (page.title === title && page.bodyMd === input.bodyMd && !input.note) return;
      await tx.update(docPages).set({ title, bodyMd: input.bodyMd }).where(eq(docPages.id, id));
      const last = await tx.query.docRevisions.findFirst({
        where: eq(docRevisions.pageId, id),
        orderBy: [desc(docRevisions.createdAt), desc(docRevisions.id)],
      });
      const fold = last && !last.note && !input.note && Date.now() - last.createdAt.getTime() < REVISION_WINDOW_MS;
      if (fold) {
        await tx.update(docRevisions).set({ title, bodyMd: input.bodyMd }).where(eq(docRevisions.id, last.id));
      } else {
        await tx.insert(docRevisions).values({ pageId: id, title, bodyMd: input.bodyMd, note: input.note?.trim() || null });
      }
    });
    refreshAll();
  });
}

/** Puts an old revision back as the current text (recorded as a new revision). */
export async function restoreRevision(revisionId: number) {
  return run(async () => {
    const rev = await db.query.docRevisions.findFirst({ where: eq(docRevisions.id, revisionId) });
    if (!rev) throw new ActionError("Revision not found");
    await db.transaction(async (tx) => {
      await tx.update(docPages).set({ title: rev.title, bodyMd: rev.bodyMd }).where(eq(docPages.id, rev.pageId));
      await tx.insert(docRevisions).values({
        pageId: rev.pageId,
        title: rev.title,
        bodyMd: rev.bodyMd,
        note: `Restored version from ${rev.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      });
    });
    refreshAll();
  });
}

export async function archiveDocPage(id: number) {
  return run(async () => {
    await db.update(docPages).set({ archivedAt: new Date() }).where(eq(docPages.id, id));
    refreshAll();
  });
}

// ---------- Systems ----------

export async function saveSystem(id: number | null, fd: FormData) {
  return run(async () => {
    const url = str(fd, "url");
    if (url && !/^https?:\/\//i.test(url)) throw new ActionError("Links must start with http:// or https://");
    const values = {
      kind: oneOf(fd, "kind", systemKind.enumValues) ?? "other",
      name: reqStr(fd, "name"),
      url,
      notes: str(fd, "notes") ?? "",
    };
    noSecrets(values.name, values.url, values.notes);
    if (id) {
      await db.update(systems).set(values).where(eq(systems.id, id));
    } else {
      const projectId = int(fd, "projectId");
      if (!projectId) throw new ActionError("Missing project");
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${systems.sortOrder}), 0)` })
        .from(systems)
        .where(and(eq(systems.projectId, projectId)));
      await db.insert(systems).values({ projectId, ...values, sortOrder: Number(max) + 1000 });
    }
    refreshAll();
  });
}

export async function deleteSystem(id: number) {
  return run(async () => {
    await db.delete(systems).where(eq(systems.id, id));
    refreshAll();
  });
}
