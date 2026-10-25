"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SyncResult } from "@/server/email-sync";
import { syncEmailNow } from "@/server/message-actions";
import { useAction } from "./use-action";

export function EmailSyncPanel({
  configured,
  account,
  mailboxes,
  last,
}: {
  configured: boolean;
  account: string | null;
  mailboxes: string[];
  last: SyncResult | null;
}) {
  const { pending, exec } = useAction();
  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium">Email</h2>
      {configured ? (
        <div className="mt-1 grid gap-3 text-sm">
          <p className="text-muted-foreground">
            Syncing <b className="text-foreground">{account}</b> ({mailboxes.join(", ")}). Only mail to or from a contact&apos;s
            email address is kept; replies are threaded and nothing is imported twice.
          </p>
          {last && (
            <p>
              Last sync {formatDistanceToNowStrict(new Date(last.at), { addSuffix: true })}: {last.imported} new
              {last.threadsCreated > 0 && ` in ${last.threadsCreated} new threads`}, {last.skipped} from unknown senders skipped.
              {last.mailboxes
                .filter((m) => m.error)
                .map((m) => (
                  <span key={m.name} className="block text-red-600">
                    {m.name}: {m.error}
                  </span>
                ))}
            </p>
          )}
          <div>
            <Button variant="outline" disabled={pending} onClick={() => exec(syncEmailNow, "Email synced")}>
              <RefreshCwIcon className={pending ? "animate-spin" : undefined} /> {pending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Not set up. Add <code>IMAP_HOST</code>, <code>IMAP_USER</code> and <code>IMAP_PASSWORD</code> to the environment
          (e.g. <code>imap.example.com</code>). See the README for scheduling the sync.
        </p>
      )}
    </section>
  );
}
