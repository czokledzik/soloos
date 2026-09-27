"use client";

import Form from "next/form";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { PERIODS } from "@/lib/period";
import { GROUP_BY } from "@/lib/report";
import type { PickerData } from "@/server/queries";
import { Field } from "./field";
import { NativeSelect } from "./native-select";

export type ReportParams = {
  period: string;
  from: string;
  to: string;
  client: string;
  project: string;
  billable: string;
  group: string;
};

/** GET form that re-submits on every change, so the URL is the report state. */
export function ReportFilters({
  params,
  orgs,
  projects,
}: {
  params: ReportParams;
  orgs: { id: number; name: string }[];
  projects: PickerData["projects"];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [period, setPeriod] = useState(params.period);
  const [client, setClient] = useState(params.client);
  const submit = () => ref.current?.requestSubmit();
  const clientProjects = client ? projects.filter((p) => String(p.orgId) === client) : projects;

  return (
    <Form
      ref={ref}
      action="/reports"
      className="flex flex-wrap items-end gap-3"
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        if (target.name === "period") setPeriod(target.value);
        if (target.name === "client") setClient(target.value);
        // Custom dates submit on blur/enter so typing doesn't navigate mid-edit.
        if (target.type !== "date") submit();
      }}
    >
      <Field label="Period" className="w-36">
        <NativeSelect name="period" defaultValue={params.period}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {period === "custom" && (
        <>
          <Field label="From">
            <Input type="date" name="from" defaultValue={params.from} onBlur={submit} />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={params.to} onBlur={submit} />
          </Field>
        </>
      )}
      <Field label="Client" className="w-44">
        <NativeSelect name="client" defaultValue={params.client}>
          <option value="">All clients</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Project" className="w-48">
        <NativeSelect name="project" defaultValue={params.project} key={client}>
          <option value="">All projects</option>
          {clientProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Billable" className="w-32">
        <NativeSelect name="billable" defaultValue={params.billable}>
          <option value="">All time</option>
          <option value="yes">Billable</option>
          <option value="no">Non-billable</option>
        </NativeSelect>
      </Field>
      <Field label="Group by" className="w-32">
        <NativeSelect name="group" defaultValue={params.group}>
          {GROUP_BY.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </Form>
  );
}
