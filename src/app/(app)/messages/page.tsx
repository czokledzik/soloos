import Link from "next/link";
import { format } from "date-fns";
import { ClipboardPasteIcon } from "lucide-react";
import { Empty, PageHeader } from "@/components/app/page-header";
import { CHANNEL_ICON } from "@/lib/channel-icons";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHANNELS, labelOf } from "@/lib/labels";
import { listAllThreads } from "@/server/message-queries";

export const metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : "";
  const rows = await listAllThreads(query);

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Conversations across channels: pasted chats and imports"
        actions={
          <Link href="/messages/new" className={buttonVariants()}>
            <ClipboardPasteIcon /> Paste conversation
          </Link>
        }
      />
      <form className="px-6 pb-3" action="/messages">
        <Input name="q" defaultValue={query} placeholder="Search messages, threads, clients…" className="max-w-md" />
      </form>
      <div className="px-6 pb-6">
        {rows.length === 0 ? (
          <Empty>
            {query ? (
              "Nothing matches."
            ) : (
              <>
                No messages yet. Paste a conversation, or import a Telegram export in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>
                .
              </>
            )}
          </Empty>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border">
            {rows.map((t) => {
              const Icon = CHANNEL_ICON[t.channel];
              return (
                <Link key={t.id} href={`/messages/${t.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/30">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.title || t.people || labelOf(CHANNELS, t.channel)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.orgName}
                      {t.people && t.title ? ` · ${t.people}` : ""}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {t.lastMessageAt ? format(t.lastMessageAt, "d MMM yyyy") : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
