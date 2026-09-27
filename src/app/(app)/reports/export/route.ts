import type { NextRequest } from "next/server";
import { format } from "date-fns";
import { entryValue } from "@/lib/billing";
import { readReportParams } from "@/lib/report-params";
import { getReportEntries } from "@/server/report-queries";

const HEADER = [
  "Date",
  "Start",
  "End",
  "Hours",
  "Client",
  "Project",
  "Task",
  "Note",
  "Billable",
  "Rate",
  "Value",
  "Currency",
];

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Detailed time entries for the same filters as /reports, as CSV. */
export async function GET(request: NextRequest) {
  const { period, filters } = readReportParams(Object.fromEntries(request.nextUrl.searchParams));
  const entries = await getReportEntries(filters);
  const rows = entries.map((e) => [
    format(e.startedAt, "yyyy-MM-dd"),
    format(e.startedAt, "HH:mm"),
    format(e.endedAt, "HH:mm"),
    (e.durationMin / 60).toFixed(2),
    e.orgName,
    e.projectName,
    e.taskTitle ?? "",
    e.note,
    e.billable ? "yes" : "no",
    e.rateSnapshot != null ? (e.rateSnapshot / 100).toFixed(2) : "",
    e.billable && e.rateSnapshot != null ? (entryValue(e) / 100).toFixed(2) : "",
    e.currency,
  ]);
  // BOM so Excel opens UTF-8 (Polish characters) correctly.
  const csv = "﻿" + [HEADER, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const name = `soloos-time-${format(period.from, "yyyyMMdd")}-${format(new Date(period.to.getTime() - 1), "yyyyMMdd")}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
