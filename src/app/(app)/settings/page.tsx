import { ImportPanel } from "@/components/app/import-panel";
import { PageHeader } from "@/components/app/page-header";
import { TelegramImport } from "@/components/app/telegram-import";
import { EmailSyncPanel } from "@/components/app/email-sync-panel";
import { emailConfig, lastEmailSync } from "@/server/email-sync";
import { AI_MODEL, aiProvider } from "@/server/ai/run";
import { getCrmPickers } from "@/server/crm-queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [crm, last] = await Promise.all([getCrmPickers(), lastEmailSync()]);
  const email = emailConfig();
  const ai = aiProvider();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Imports and maintenance" />
      <div className="grid gap-8 px-6 pb-6">
        <section>
          <h2 className="mb-3 text-sm font-medium">Import</h2>
          <div className="grid gap-4">
            <ImportPanel orgs={crm.orgs} />
            <TelegramImport orgs={crm.orgs} />
            <EmailSyncPanel
              configured={email != null}
              account={email?.user ?? null}
              mailboxes={email?.mailboxes ?? []}
              last={last}
            />
          </div>
        </section>
        <section className="max-w-2xl text-sm">
          <h2 className="mb-2 font-medium">Claude in the app</h2>
          <p className="text-muted-foreground">
            {ai === "api" && <>Using the Anthropic API ({AI_MODEL()}). Buttons on threads, project briefs and leads ask Claude for suggestions you accept one by one.</>}
            {ai === "runner" && <>Using a local Claude Code runner: jobs wait until <code className="rounded bg-muted px-1">pnpm ai:runner</code> picks them up.</>}
            {ai === "off" && <>Off. Set <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code>, or <code className="rounded bg-muted px-1">AI_PROVIDER=runner</code> with a local runner (see the README).</>}{" "}
            The client portal never uses AI.
          </p>
        </section>
      </div>
    </div>
  );
}
