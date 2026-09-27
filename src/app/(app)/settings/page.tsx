import { ImportPanel } from "@/components/app/import-panel";
import { PageHeader } from "@/components/app/page-header";
import { getCrmPickers } from "@/server/crm-queries";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const crm = await getCrmPickers();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Imports and maintenance" />
      <div className="grid gap-8 px-6 pb-6">
        <section>
          <h2 className="mb-3 text-sm font-medium">Import</h2>
          <ImportPanel orgs={crm.orgs} />
        </section>
        <section className="max-w-2xl text-sm">
          <h2 className="mb-2 font-medium">Backups</h2>
          <p className="text-muted-foreground">
            A nightly job (20:00) dumps the database and pushes it to the private GitHub repo{" "}
            <code className="rounded bg-muted px-1">soloos-backups</code>. Run <code className="rounded bg-muted px-1">pnpm backup</code>{" "}
            for an immediate backup. Restore instructions are in the README.
          </p>
        </section>
      </div>
    </div>
  );
}
