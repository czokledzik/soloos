import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { PageHeader } from "@/components/app/page-header";
import { PasteFix, type PasteFixDefaults } from "@/components/app/paste-fix";
import { db, interactions } from "@/db";
import { getCrmPickers } from "@/server/crm-queries";
import { getThread } from "@/server/message-queries";
import { getPickerData } from "@/server/queries";

export const metadata = { title: "Paste conversation" };

const num = (v: string | string[] | undefined) => (typeof v === "string" && Number(v) > 0 ? Number(v) : undefined);

export default async function PasteConversationPage({ searchParams }: PageProps<"/messages/new">) {
  const sp = await searchParams;
  const [crm, pickers] = await Promise.all([getCrmPickers(), getPickerData()]);
  const defaults: PasteFixDefaults = {
    orgId: num(sp.org),
    opportunityId: num(sp.lead),
    projectId: num(sp.project),
  };

  // Converting a logged conversation: prefill from it.
  const interactionId = num(sp.interaction);
  if (interactionId) {
    const i = await db.query.interactions.findFirst({ where: eq(interactions.id, interactionId) });
    if (!i) notFound();
    Object.assign(defaults, {
      interactionId,
      orgId: i.orgId,
      opportunityId: i.opportunityId ?? undefined,
      projectId: i.projectId ?? undefined,
      channel: i.channel,
      title: i.title ?? "",
      text: i.bodyMd,
      date: format(i.occurredAt, "yyyy-MM-dd"),
    });
  }

  const threadId = num(sp.thread);
  if (threadId) {
    const t = await getThread(threadId);
    if (!t) notFound();
    defaults.orgId = t.orgId;
    defaults.thread = {
      id: t.id,
      title: t.title,
      orgName: t.orgName,
      senders: t.participants.map((p) => p.name),
      me: t.participants.find((p) => p.isMe)?.name ?? null,
    };
  }

  return (
    <div>
      <PageHeader
        title={interactionId ? "Split conversation into messages" : threadId ? "Add messages" : "Paste conversation"}
        subtitle={
          interactionId
            ? "The logged conversation is replaced by the messages once you save."
            : "Paste a chat, check how it was split, fix what's wrong, save."
        }
      />
      <div className="px-6 pb-6">
        <PasteFix crm={crm} projects={pickers.projects} defaults={defaults} />
      </div>
    </div>
  );
}
