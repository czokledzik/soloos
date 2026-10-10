import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ThreadAiPanel } from "@/components/app/ai-panel";
import { ThreadEditor } from "@/components/app/thread-view";
import { aiProvider, jobView } from "@/server/ai/run";
import { CHANNELS, labelOf } from "@/lib/labels";
import { getCrmPickers } from "@/server/crm-queries";
import { getThread } from "@/server/message-queries";
import { getPickerData } from "@/server/queries";

// "Ask Claude" runs as a server action of this page and can take a while.
export const maxDuration = 300;

export default async function ThreadPage({ params }: PageProps<"/messages/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [thread, crm, pickers, job] = await Promise.all([
    getThread(id),
    getCrmPickers(),
    getPickerData(),
    jobView("thread_insights", id),
  ]);
  if (!thread) notFound();
  const contacts = crm.contacts;

  return (
    <div>
      <PageHeader
        title={thread.title || thread.participants.filter((p) => !p.isMe).map((p) => p.name).join(", ") || "Thread"}
        subtitle={
          <span>
            <Link href={`/clients/${thread.orgId}`} className="hover:underline">
              {thread.orgName}
            </Link>{" "}
            · {labelOf(CHANNELS, thread.channel)} · {thread.messages.length} messages
          </span>
        }
      />
      <div className="px-6 pb-6">
        <ThreadEditor
          thread={thread}
          crm={crm}
          projects={pickers.projects}
          contacts={contacts}
          ai={<ThreadAiPanel threadId={id} projectId={thread.projectId} job={job} enabled={aiProvider() !== "off"} />}
        />
      </div>
    </div>
  );
}
