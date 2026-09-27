"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/server/form";
import { importClockify, importLinear, type ImportSummary } from "@/server/import-actions";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

type Importer = (fd: FormData) => Promise<ActionResult<ImportSummary>>;

/** Upload → preview (dry run) → import. The file stays selected between the two steps. */
function ImportForm({
  title,
  description,
  importer,
  children,
}: {
  title: string;
  description: React.ReactNode;
  importer: Importer;
  children?: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, exec } = useAction();
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function go(dryRun: boolean) {
    if (!form.current?.reportValidity()) return;
    const fd = new FormData(form.current);
    fd.set("dryRun", dryRun ? "1" : "0");
    const res = await exec(() => importer(fd), dryRun ? undefined : "Import finished");
    if (res.ok && res.data) setSummary(res.data);
  }

  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>
      <form ref={form} className="grid gap-3" onSubmit={(e) => e.preventDefault()} onChange={() => setSummary(null)}>
        <Field label="CSV file">
          <Input name="file" type="file" accept=".csv,text/csv" required />
        </Field>
        {children}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => go(true)}>
            Preview
          </Button>
          <Button
            type="button"
            disabled={pending || !summary?.dryRun || summary.imported === 0}
            onClick={() => go(false)}
          >
            <UploadIcon /> Import
          </Button>
        </div>
      </form>
      {summary && <SummaryView summary={summary} />}
    </section>
  );
}

function SummaryView({ summary: s }: { summary: ImportSummary }) {
  const verb = s.dryRun ? "Will import" : "Imported";
  return (
    <div className="mt-4 grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="font-medium">
        {verb} {s.imported} of {s.rows} rows
        {s.hours != null && ` · ${s.hours} h`}
        {s.from && ` · ${s.from} → ${s.to}`}
      </div>
      <ul className="grid gap-0.5 text-muted-foreground">
        {s.info.map((i) => (
          <li key={i}>{i}</li>
        ))}
        {s.duplicates > 0 && <li>{s.duplicates} already imported (skipped)</li>}
        {s.skipped > 0 && <li>{s.skipped} skipped</li>}
        {s.newClients.length > 0 && <li>New clients: {s.newClients.join(", ")}</li>}
        {s.newProjects.length > 0 && <li>New projects: {s.newProjects.join(", ")}</li>}
        {s.newTasks > 0 && <li>{s.newTasks} tasks</li>}
      </ul>
      {s.errors.length > 0 && (
        <ul className="grid gap-0.5 text-red-600">
          {s.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {s.dryRun && s.imported > 0 && <p className="text-xs text-muted-foreground">Nothing is saved until you click Import.</p>}
    </div>
  );
}

export function ImportPanel({ orgs }: { orgs: { id: number; name: string }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ImportForm
        title="Clockify time entries"
        importer={importClockify}
        description={
          <>
            Clockify → Reports → <b>Detailed</b> → pick the date range → Export → <b>Save as CSV</b>. Clients and projects are
            matched by name (created if missing), Clockify tasks become done tasks, rates are kept. Re-importing the same file
            skips entries already imported.
          </>
        }
      >
        <Field label="Date format in the file" className="w-56">
          <NativeSelect name="dateOrder" defaultValue="auto">
            <option value="auto">Detect automatically</option>
            <option value="dmy">DD/MM/YYYY</option>
            <option value="mdy">MM/DD/YYYY</option>
            <option value="ymd">YYYY-MM-DD</option>
          </NativeSelect>
        </Field>
      </ImportForm>
      <ImportForm
        title="Linear issues"
        importer={importLinear}
        description={
          <>
            Linear → Settings → <b>Import / export</b> → Export CSV (or select issues → Export). Each Linear project becomes a
            project under the client you pick; status, priority, due date and description are kept.
          </>
        }
      >
        <Field label="Client" className="w-64">
          <NativeSelect name="orgId" required defaultValue="">
            <option value="">Select client…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="includeCanceled" /> Include canceled issues
        </label>
      </ImportForm>
    </div>
  );
}
