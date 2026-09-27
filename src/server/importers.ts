import "server-only";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import type { TaskStatus } from "@/db/schema";

// ---------- CSV helpers ----------

type Row = Record<string, string>;

export function parseCsv(text: string): { rows: Row[]; headers: string[] } {
  const res = Papa.parse<Row>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return { rows: res.data, headers: res.meta.fields ?? [] };
}

/** Finds the first header matching any pattern (case-insensitive). */
function column(headers: string[], ...patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x));
    if (h) return h;
  }
  return null;
}

const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 20);

// ---------- Dates ----------

export type DateOrder = "auto" | "dmy" | "mdy" | "ymd";

/** Splits "27/09/2026", "09-27-2026", "27.09.2026", "2026-09-27" into numeric parts. */
function dateParts(s: string): [number, number, number] | null {
  const m = s.trim().match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Guesses the date order from the data: a first part > 12 means day-first, etc. */
export function detectDateOrder(samples: string[]): Exclude<DateOrder, "auto"> {
  let dmy = false;
  let mdy = false;
  for (const s of samples) {
    const p = dateParts(s);
    if (!p) continue;
    if (p[0] > 31) return "ymd";
    if (p[0] > 12) dmy = true;
    if (p[1] > 12) mdy = true;
  }
  if (mdy && !dmy) return "mdy";
  return "dmy"; // ambiguous → European default
}

function toDate(dateStr: string, timeStr: string, order: Exclude<DateOrder, "auto">): Date | null {
  const p = dateParts(dateStr);
  if (!p) return null;
  const [y, mo, d] =
    order === "ymd" ? [p[0], p[1], p[2]] : order === "dmy" ? [p[2], p[1], p[0]] : [p[2], p[0], p[1]];
  const t = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!t) return null;
  let h = Number(t[1]);
  const ampm = t[4]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  const date = new Date(y < 100 ? 2000 + y : y, mo - 1, d, h, Number(t[2]), Number(t[3] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------- Clockify ----------

export type ClockifyEntry = {
  line: number;
  client: string;
  project: string;
  task: string;
  note: string;
  billable: boolean;
  startedAt: Date;
  endedAt: Date;
  durationMin: number;
  rate: number | null; // minor units
  importKey: string;
};

export type ParseResult<T> = { items: T[]; errors: string[]; info: string[] };

/** Parses a Clockify "Detailed report" CSV export. */
export function parseClockify(text: string, order: DateOrder = "auto"): ParseResult<ClockifyEntry> {
  const { rows, headers } = parseCsv(text);
  const col = {
    project: column(headers, /^project$/i),
    client: column(headers, /^client$/i),
    description: column(headers, /^description$/i),
    task: column(headers, /^task$/i),
    billable: column(headers, /^billable$/i),
    startDate: column(headers, /^start date$/i),
    startTime: column(headers, /^start time$/i),
    endDate: column(headers, /^end date$/i),
    endTime: column(headers, /^end time$/i),
    rate: column(headers, /^billable rate/i),
  };
  const missing = (["project", "startDate", "startTime", "endDate", "endTime"] as const).filter((k) => !col[k]);
  if (missing.length) {
    return {
      items: [],
      errors: [`Not a Clockify detailed report: missing column(s) ${missing.join(", ")}. Found: ${headers.join(", ")}`],
      info: [],
    };
  }

  const resolved = order === "auto" ? detectDateOrder(rows.map((r) => r[col.startDate!])) : order;
  const info = [`Date format: ${resolved.toUpperCase()}${order === "auto" ? " (detected)" : ""}`];
  const errors: string[] = [];
  const items: ClockifyEntry[] = [];

  rows.forEach((r, i) => {
    const line = i + 2;
    const startedAt = toDate(r[col.startDate!], r[col.startTime!], resolved);
    const endedAt = toDate(r[col.endDate!], r[col.endTime!], resolved);
    if (!startedAt || !endedAt) {
      errors.push(`Line ${line}: can't read date/time "${r[col.startDate!]} ${r[col.startTime!]}"`);
      return;
    }
    const durationMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
    if (durationMin <= 0) return; // zero-length entries carry no information
    const client = (col.client && r[col.client]?.trim()) || "";
    const project = r[col.project!]?.trim() || "No project";
    const note = (col.description && r[col.description]?.trim()) || "";
    const rateRaw = col.rate ? r[col.rate]?.replace(/\s/g, "").replace(",", ".") : "";
    const rate = rateRaw && Number.isFinite(Number(rateRaw)) && Number(rateRaw) > 0 ? Math.round(Number(rateRaw) * 100) : null;
    items.push({
      line,
      client,
      project,
      task: (col.task && r[col.task]?.trim()) || "",
      note,
      billable: col.billable ? /^(yes|true|1|tak)$/i.test(r[col.billable]?.trim() ?? "") : true,
      startedAt,
      endedAt,
      durationMin,
      rate,
      importKey: `clockify:${shortHash([startedAt.toISOString(), endedAt.toISOString(), client, project, note].join("|"))}`,
    });
  });
  return { items, errors, info };
}

// ---------- Linear ----------

export type LinearIssue = {
  line: number;
  identifier: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  project: string;
  dueDate: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
  canceled: boolean;
  importKey: string;
};

function linearStatus(status: string, completed: boolean): TaskStatus {
  if (completed) return "done";
  const s = status.toLowerCase();
  if (/done|complete|closed/.test(s)) return "done";
  if (/review/.test(s)) return "review";
  if (/progress|doing|started/.test(s)) return "in_progress";
  if (/backlog|triage|icebox/.test(s)) return "backlog";
  return "todo";
}

function linearPriority(p: string): number {
  const s = p.toLowerCase();
  if (/urgent|high/.test(s) || s === "1" || s === "2") return 3;
  if (/medium/.test(s) || s === "3") return 2;
  if (/low/.test(s) || s === "4") return 1;
  return 0;
}

function anyDate(s: string | undefined): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parses a Linear issues CSV export. */
export function parseLinear(text: string): ParseResult<LinearIssue> {
  const { rows, headers } = parseCsv(text);
  const col = {
    id: column(headers, /^id$/i, /^identifier$/i),
    title: column(headers, /^title$/i),
    description: column(headers, /^description$/i),
    status: column(headers, /^status$/i),
    priority: column(headers, /^priority$/i),
    project: column(headers, /^project$/i, /^project name$/i),
    team: column(headers, /^team$/i),
    due: column(headers, /^due date$/i),
    created: column(headers, /^created( at)?$/i),
    completed: column(headers, /^completed( at)?$/i),
    canceled: column(headers, /^cancell?ed( at)?$/i),
  };
  if (!col.id || !col.title) {
    return {
      items: [],
      errors: [`Not a Linear export: need "ID" and "Title" columns. Found: ${headers.join(", ")}`],
      info: [],
    };
  }
  const items: LinearIssue[] = rows
    .filter((r) => r[col.id!]?.trim() && r[col.title!]?.trim())
    .map((r, i) => {
      const completedAt = anyDate(col.completed ? r[col.completed] : undefined);
      const due = anyDate(col.due ? r[col.due] : undefined);
      const team = (col.team && r[col.team]?.trim()) || "Linear";
      return {
        line: i + 2,
        identifier: r[col.id!].trim(),
        title: r[col.title!].trim(),
        description: (col.description && r[col.description]) || "",
        status: linearStatus((col.status && r[col.status]) || "", completedAt != null),
        priority: linearPriority((col.priority && r[col.priority]) || ""),
        project: (col.project && r[col.project]?.trim()) || `${team} (Linear)`,
        dueDate: due ? due.toISOString().slice(0, 10) : null,
        createdAt: anyDate(col.created ? r[col.created] : undefined),
        completedAt,
        canceled: anyDate(col.canceled ? r[col.canceled] : undefined) != null,
        importKey: `linear:${r[col.id!].trim()}`,
      };
    });
  return { items, errors: [], info: [] };
}
