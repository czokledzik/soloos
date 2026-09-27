"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import type { Organization, Project, TimeEntry } from "@/db/schema";
import {
  CONTRACT_TYPES,
  PRICING,
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
} from "@/lib/labels";
import { formatMinutes, moneyInput } from "@/lib/format";
import {
  createProject,
  createTask,
  createTimeEntry,
  updateProject,
  updateTimeEntry,
} from "@/server/actions";
import type { PickerData } from "@/server/queries";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

type OnDone = (id?: number) => void;

export function ProjectPicker({
  projects,
  value,
  onChange,
  name = "projectId",
}: {
  projects: PickerData["projects"];
  value?: number | null;
  onChange?: (id: number | null) => void;
  name?: string;
}) {
  const byOrg = new Map<string, PickerData["projects"]>();
  for (const p of projects) byOrg.set(p.orgName, [...(byOrg.get(p.orgName) ?? []), p]);
  return (
    <NativeSelect
      name={name}
      required
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Select project…</option>
      {[...byOrg].map(([org, list]) => (
        <optgroup key={org} label={org}>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}

// ---------- Project ----------

export function ProjectForm({
  orgs,
  project,
  defaultOrgId,
  onDone,
}: {
  orgs: Pick<Organization, "id" | "name">[];
  project?: Project;
  defaultOrgId?: number;
  onDone?: OnDone;
}) {
  const { pending, exec } = useAction();
  const [pricing, setPricing] = useState<string>(project?.pricing ?? "hourly");
  const [orgId, setOrgId] = useState<string>(String(project?.orgId ?? defaultOrgId ?? ""));

  return (
    <form
      className="grid gap-3"
      action={async (fd) => {
        const res = project
          ? await exec(() => updateProject(project.id, fd), "Project saved")
          : await exec(() => createProject(fd), "Project created");
        if (res.ok) onDone?.(typeof res.data === "number" ? res.data : project?.id);
      }}
    >
      <Field label="Name">
        <Input name="name" required autoFocus defaultValue={project?.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <NativeSelect name="orgId" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">{project ? "Select client…" : "New client →"}</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!orgId && !project ? (
          <Field label="New client name">
            <Input name="newOrgName" placeholder="Acme Sp. z o.o." />
          </Field>
        ) : (
          <Field label="Status">
            <NativeSelect name="status" defaultValue={project?.status ?? "active"}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pricing">
          <NativeSelect name="pricing" value={pricing} onChange={(e) => setPricing(e.target.value)}>
            {PRICING.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Contract">
          <NativeSelect name="contractType" defaultValue={project?.contractType ?? ""}>
            <option value="">—</option>
            {CONTRACT_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {pricing === "hourly" && (
          <Field label="Hourly rate">
            <Input name="hourlyRate" inputMode="decimal" defaultValue={moneyInput(project?.hourlyRate)} />
          </Field>
        )}
        {pricing === "fixed" && (
          <Field label="Fixed price">
            <Input name="fixedPrice" inputMode="decimal" defaultValue={moneyInput(project?.fixedPrice)} />
          </Field>
        )}
        <Field label="Currency">
          <Input name="currency" defaultValue={project?.currency ?? "PLN"} maxLength={3} />
        </Field>
        <Field label="Budget (hours)">
          <Input name="budgetHours" type="number" min={0} defaultValue={project?.budgetHours ?? ""} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <Input name="startDate" type="date" defaultValue={project?.startDate ?? ""} />
        </Field>
        <Field label="Due">
          <Input name="dueDate" type="date" defaultValue={project?.dueDate ?? ""} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {project ? "Save" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Task ----------

export function TaskCreateForm({
  projects,
  defaultProjectId,
  defaultStatus = "todo",
  onDone,
}: {
  projects: PickerData["projects"];
  defaultProjectId?: number;
  defaultStatus?: string;
  onDone?: OnDone;
}) {
  const { pending, exec } = useAction();
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId ?? null);
  return (
    <form
      className="grid gap-3"
      action={async (fd) => {
        const res = await exec(() => createTask(fd), "Task created");
        if (res.ok) onDone?.(res.data);
      }}
    >
      <Field label="Title">
        <Input name="title" required autoFocus />
      </Field>
      <Field label="Project">
        <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <NativeSelect name="status" defaultValue={defaultStatus}>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Priority">
          <NativeSelect name="priority" defaultValue="0">
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Due">
          <Input name="dueDate" type="date" />
        </Field>
        <Field label="Estimate" hint="e.g. 2h, 1:30, 45m">
          <Input name="estimate" />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          Create task
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Time entry ----------

export function TimeEntryForm({
  pickers,
  entry,
  defaultProjectId,
  defaultTaskId,
  defaultDate,
  onDone,
}: {
  pickers: PickerData;
  entry?: TimeEntry;
  defaultProjectId?: number;
  defaultTaskId?: number | null;
  defaultDate?: string;
  onDone?: OnDone;
}) {
  const { pending, exec } = useAction();
  const [projectId, setProjectId] = useState<number | null>(entry?.projectId ?? defaultProjectId ?? null);
  const projectTasks = pickers.tasks.filter((t) => t.projectId === projectId);
  // Keep a done task selectable when editing an entry that references it.
  const taskId = entry?.taskId ?? defaultTaskId ?? null;
  const hasTask = taskId == null || projectTasks.some((t) => t.id === taskId);

  return (
    <form
      className="grid gap-3"
      action={async (fd) => {
        const res = entry
          ? await exec(() => updateTimeEntry(entry.id, fd), "Entry saved")
          : await exec(() => createTimeEntry(fd), "Time logged");
        if (res.ok) onDone?.(typeof res.data === "number" ? res.data : entry?.id);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <ProjectPicker projects={pickers.projects} value={projectId} onChange={setProjectId} />
        </Field>
        <Field label="Task">
          <NativeSelect name="taskId" defaultValue={taskId ?? ""} key={projectId}>
            <option value="">No task</option>
            {!hasTask && <option value={taskId!}>(completed task)</option>}
            {projectTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Date">
          <Input
            name="date"
            type="date"
            required
            defaultValue={entry ? format(entry.startedAt, "yyyy-MM-dd") : (defaultDate ?? format(new Date(), "yyyy-MM-dd"))}
          />
        </Field>
        <Field label="Start">
          <Input name="start" type="time" defaultValue={entry ? format(entry.startedAt, "HH:mm") : ""} />
        </Field>
        <Field label="End">
          <Input name="end" type="time" defaultValue={entry ? format(entry.endedAt, "HH:mm") : ""} />
        </Field>
        <Field label="or Duration">
          <Input
            name="duration"
            placeholder="1:30"
            defaultValue={entry ? formatMinutes(entry.durationMin) : ""}
          />
        </Field>
      </div>
      <Field label="Note">
        <Input name="note" defaultValue={entry?.note ?? ""} />
      </Field>
      <Field label="Billable">
        <NativeSelect name="billable" defaultValue={entry ? (entry.billable ? "yes" : "no") : "auto"}>
          {!entry && <option value="auto">Project default</option>}
          <option value="yes">Billable</option>
          <option value="no">Not billable</option>
        </NativeSelect>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {entry ? "Save" : "Log time"}
        </Button>
      </DialogFooter>
    </form>
  );
}
