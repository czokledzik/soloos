"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";
import { MessageCircleIcon } from "lucide-react";
import type { OpportunityStage } from "@/db/schema";
import { formatMoney, formatMoneyTotals, toDateString } from "@/lib/format";
import { OPPORTUNITY_STAGES, STAGE_DOT } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { moveOpportunity } from "@/server/crm-actions";
import type { PipelineRow } from "@/server/crm-queries";
import { Kanban, type KanbanColumn } from "./kanban";
import { useAction } from "./use-action";

const stageOf = (o: PipelineRow) => o.stage;

export function PipelineBoard({ rows }: { rows: PipelineRow[] }) {
  const { exec } = useAction();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const columns: KanbanColumn<OpportunityStage>[] = OPPORTUNITY_STAGES.map((s) => ({
    key: s.value,
    className: s.value === "won" || s.value === "lost" ? "w-60" : undefined,
    header: (ids) => {
      const value = formatMoneyTotals(ids.map((id) => ({ amount: byId.get(id)?.estValue ?? null, currency: byId.get(id)?.currency ?? "PLN" })));
      return (
        <>
          <span className={cn("size-2 rounded-full", STAGE_DOT[s.value])} />
          <span className="font-medium">{s.label}</span>
          <span className="text-muted-foreground">{ids.length}</span>
          {value !== "—" && <span className="ml-auto text-xs text-muted-foreground">{value}</span>}
        </>
      );
    },
  }));

  return (
    <Kanban
      columns={columns}
      items={rows}
      columnOf={stageOf}
      onMove={(id, stage, ids) => exec(() => moveOpportunity(id, stage, ids))}
      renderCard={(row, { overlay }) => <LeadCard row={row} overlay={overlay} />}
    />
  );
}


function LeadCard({ row, overlay }: { row: PipelineRow; overlay: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("opp", String(row.id));
  const closed = row.stage === "won" || row.stage === "lost";
  const today = toDateString(new Date());
  const overdue = !closed && row.nextActionAt != null && row.nextActionAt < today;
  const dueToday = !closed && row.nextActionAt === today;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2.5 text-sm shadow-xs",
        overlay && "rotate-1 shadow-lg",
        closed && "opacity-70",
      )}
    >
      <Link href={`${pathname}?${next}`} scroll={false} className="block leading-snug font-medium hover:underline">
        {row.title}
      </Link>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {row.orgName}
        {row.contactName && row.contactName !== row.orgName ? ` · ${row.contactName}` : ""}
      </div>
      {!closed && row.nextAction && (
        <div
          className={cn(
            "mt-2 truncate text-xs",
            overdue ? "font-medium text-red-500" : dueToday ? "font-medium text-amber-600" : "text-muted-foreground",
          )}
        >
          → {row.nextAction}
          {row.nextActionAt && ` · ${relative(row.nextActionAt)}`}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {row.sourceDetail && <span className="truncate">{row.sourceDetail}</span>}
        {row.lastContactAt && (
          <span className="shrink-0" title="Last conversation">
            <MessageCircleIcon className="mr-0.5 inline size-3 align-[-2px]" />
            {formatDistanceToNowStrict(row.lastContactAt, { addSuffix: true })}
          </span>
        )}
        {row.estValue != null && <span className="ml-auto shrink-0 font-medium text-foreground">{formatMoney(row.estValue, row.currency)}</span>}
      </div>
    </div>
  );
}

function relative(date: string): string {
  const days = differenceInCalendarDays(new Date(date), new Date());
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days < 0 ? `${-days}d overdue` : `in ${days}d`;
}
