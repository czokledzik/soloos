"use server";

import { and, eq, isNull } from "drizzle-orm";
import {
  channel,
  contacts,
  db,
  direction,
  interactions,
  leadSource,
  opportunities,
  opportunityStage,
  orgKind,
  orgStatus,
  organizations,
  projects,
  type OpportunityStage,
} from "@/db";
import { ActionError, int, money, oneOf, reqStr, run, str } from "./form";
import { refreshAll } from "./refresh";

// ---------- Organizations ----------

function orgValues(fd: FormData) {
  return {
    name: reqStr(fd, "name"),
    kind: oneOf(fd, "kind", orgKind.enumValues) ?? "company",
    status: oneOf(fd, "status", orgStatus.enumValues) ?? "lead",
    website: str(fd, "website"),
    defaultRate: money(fd, "defaultRate"),
    currency: str(fd, "currency") ?? "PLN",
  };
}

export async function saveOrganization(id: number | null, fd: FormData) {
  return run(async () => {
    if (id) {
      await db.update(organizations).set(orgValues(fd)).where(eq(organizations.id, id));
      refreshAll();
      return id;
    }
    const [org] = await db.insert(organizations).values(orgValues(fd)).returning({ id: organizations.id });
    refreshAll();
    return org.id;
  });
}

export async function updateOrganizationNotes(id: number, notesMd: string) {
  return run(async () => {
    await db.update(organizations).set({ notesMd }).where(eq(organizations.id, id));
    refreshAll();
  });
}

export async function archiveOrganization(id: number) {
  return run(async () => {
    await db.update(organizations).set({ archivedAt: new Date() }).where(eq(organizations.id, id));
    refreshAll();
  });
}

// ---------- Contacts ----------

function contactValues(fd: FormData) {
  const emails = (str(fd, "emails") ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  return {
    name: reqStr(fd, "name"),
    role: str(fd, "role"),
    emails,
    phone: str(fd, "phone"),
    telegram: str(fd, "telegram"),
    facebookUrl: str(fd, "facebookUrl"),
    linkedinUrl: str(fd, "linkedinUrl"),
  };
}

export async function saveContact(id: number | null, fd: FormData) {
  return run(async () => {
    if (id) {
      await db.update(contacts).set(contactValues(fd)).where(eq(contacts.id, id));
    } else {
      const orgId = int(fd, "orgId");
      if (!orgId) throw new ActionError("Missing client");
      await db.insert(contacts).values({ orgId, ...contactValues(fd) });
    }
    refreshAll();
  });
}

export async function deleteContact(id: number) {
  return run(async () => {
    await db.delete(contacts).where(eq(contacts.id, id));
    refreshAll();
  });
}

// ---------- Leads / opportunities ----------

/**
 * Quick capture: creates (or reuses) the organization, an optional contact,
 * and the opportunity in one go. Built for "saw a post in a FB group".
 */
export async function createLead(fd: FormData) {
  return run(async () => {
    const post = str(fd, "originalPostMd") ?? "";
    const personName = str(fd, "contactName");
    const companyName = str(fd, "companyName");
    let orgId = int(fd, "orgId");
    const title = str(fd, "title") ?? firstLine(post) ?? companyName ?? personName;
    if (!title) throw new ActionError("Give the lead a title or paste the post");

    return db.transaction(async (tx) => {
      if (!orgId) {
        const name = companyName ?? personName;
        if (!name) throw new ActionError("Enter a person or company name");
        const [org] = await tx
          .insert(organizations)
          .values({ name, kind: companyName ? "company" : "person", status: "lead" })
          .returning({ id: organizations.id });
        orgId = org.id;
      }

      let contactId: number | null = null;
      if (personName) {
        const existing = await tx.query.contacts.findFirst({
          where: and(eq(contacts.orgId, orgId), eq(contacts.name, personName)),
        });
        if (existing) {
          contactId = existing.id;
        } else {
          const email = str(fd, "contactEmail");
          const [c] = await tx
            .insert(contacts)
            .values({
              orgId,
              name: personName,
              facebookUrl: str(fd, "contactFacebookUrl"),
              emails: email ? [email] : [],
            })
            .returning({ id: contacts.id });
          contactId = c.id;
        }
      }

      const [opp] = await tx
        .insert(opportunities)
        .values({
          orgId,
          contactId,
          title: title.slice(0, 200),
          stage: "new",
          source: oneOf(fd, "source", leadSource.enumValues) ?? "fb_group",
          sourceDetail: str(fd, "sourceDetail"),
          sourceUrl: str(fd, "sourceUrl"),
          originalPostMd: post,
          estValue: money(fd, "estValue"),
          nextAction: str(fd, "nextAction"),
          nextActionAt: str(fd, "nextActionAt"),
        })
        .returning({ id: opportunities.id });
      refreshAll();
      return opp.id;
    });
  });
}

function firstLine(text: string): string | null {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

export async function updateOpportunity(id: number, fd: FormData) {
  return run(async () => {
    const stage = oneOf(fd, "stage", opportunityStage.enumValues);
    await db
      .update(opportunities)
      .set({
        title: reqStr(fd, "title"),
        source: oneOf(fd, "source", leadSource.enumValues) ?? "other",
        sourceDetail: str(fd, "sourceDetail"),
        sourceUrl: str(fd, "sourceUrl"),
        estValue: money(fd, "estValue"),
        nextAction: str(fd, "nextAction"),
        nextActionAt: str(fd, "nextActionAt"),
        lostReason: str(fd, "lostReason"),
        offerSlug: str(fd, "offerSlug"),
        contactId: int(fd, "contactId"),
        originalPostMd: str(fd, "originalPostMd") ?? "",
      })
      .where(eq(opportunities.id, id));
    if (stage) await applyStage(id, stage);
    refreshAll();
  });
}

/** Sets the stage and applies side effects (won → org becomes an active client). */
async function applyStage(id: number, stage: OpportunityStage) {
  const [opp] = await db
    .update(opportunities)
    .set({ stage, ...(stage === "won" || stage === "lost" ? { nextActionAt: null } : {}) })
    .where(eq(opportunities.id, id))
    .returning();
  if (stage === "won" && opp) {
    await db
      .update(organizations)
      .set({ status: "active" })
      .where(and(eq(organizations.id, opp.orgId), eq(organizations.status, "lead")));
  }
}

export async function setOpportunityStage(id: number, stage: OpportunityStage) {
  return run(async () => {
    if (!opportunityStage.enumValues.includes(stage)) throw new ActionError("Bad stage");
    await applyStage(id, stage);
    refreshAll();
  });
}

export async function moveOpportunity(id: number, stage: OpportunityStage, orderedIds: number[]) {
  return run(async () => {
    if (!opportunityStage.enumValues.includes(stage)) throw new ActionError("Bad stage");
    const current = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
    if (!current) throw new ActionError("Lead not found");
    if (current.stage !== stage) await applyStage(id, stage);
    await db.transaction(async (tx) => {
      for (const [i, oppId] of orderedIds.entries()) {
        await tx
          .update(opportunities)
          .set({ sortOrder: (i + 1) * 1000 })
          .where(eq(opportunities.id, oppId));
      }
    });
    refreshAll();
  });
}

/** Won lead → project (fixed price if a value was estimated). Returns the project id. */
export async function convertOpportunityToProject(id: number) {
  return run(async () => {
    const opp = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, id),
      with: { org: true },
    });
    if (!opp) throw new ActionError("Lead not found");
    if (opp.projectId) return opp.projectId;
    const projectId = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({
          orgId: opp.orgId,
          name: opp.title,
          status: "active",
          pricing: opp.estValue ? "fixed" : "hourly",
          fixedPrice: opp.estValue,
          currency: opp.org.currency,
          notesMd: opp.originalPostMd ? `## Original request\n\n${opp.originalPostMd}\n` : "",
        })
        .returning({ id: projects.id });
      await tx.update(opportunities).set({ projectId: p.id }).where(eq(opportunities.id, id));
      // Conversations logged on the lead now also belong to the project.
      await tx
        .update(interactions)
        .set({ projectId: p.id })
        .where(and(eq(interactions.opportunityId, id), isNull(interactions.projectId)));
      return p.id;
    });
    await applyStage(id, "won");
    refreshAll();
    return projectId;
  });
}

export async function deleteOpportunity(id: number) {
  return run(async () => {
    await db.delete(opportunities).where(eq(opportunities.id, id));
    refreshAll();
  });
}

// ---------- Interactions ----------

function interactionValues(fd: FormData) {
  const date = str(fd, "date");
  const time = str(fd, "time") ?? "12:00";
  return {
    contactId: int(fd, "contactId"),
    opportunityId: int(fd, "opportunityId"),
    projectId: int(fd, "projectId"),
    channel: oneOf(fd, "channel", channel.enumValues) ?? "other",
    direction: oneOf(fd, "direction", direction.enumValues) ?? "both",
    occurredAt: date ? new Date(`${date}T${time}`) : new Date(),
    title: str(fd, "title"),
    bodyMd: str(fd, "bodyMd") ?? "",
  };
}

export async function saveInteraction(id: number | null, fd: FormData) {
  return run(async () => {
    const values = interactionValues(fd);
    if (!values.bodyMd && !values.title) throw new ActionError("Paste the conversation or add a title");
    if (id) {
      await db.update(interactions).set(values).where(eq(interactions.id, id));
    } else {
      const orgId = int(fd, "orgId");
      if (!orgId) throw new ActionError("Pick a client");
      await db.insert(interactions).values({ orgId, ...values });
      // Replying to a new lead moves it to "contacted".
      if (values.opportunityId && values.direction !== "internal") {
        await db
          .update(opportunities)
          .set({ stage: "contacted" })
          .where(and(eq(opportunities.id, values.opportunityId), eq(opportunities.stage, "new")));
      }
    }
    refreshAll();
  });
}

export async function deleteInteraction(id: number) {
  return run(async () => {
    await db.delete(interactions).where(eq(interactions.id, id));
    refreshAll();
  });
}
