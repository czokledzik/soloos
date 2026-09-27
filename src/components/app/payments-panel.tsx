"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Payment } from "@/db/schema";
import { formatDate, formatMoney, toDateString } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createPayment, deletePayment, setPaymentPaid } from "@/server/actions";
import { useAction } from "./use-action";

const TEMPLATES = [
  { label: "40% upfront / 60% on delivery", parts: [["Upfront", 40], ["On delivery", 60]] },
  { label: "50 / 50", parts: [["Upfront", 50], ["On delivery", 50]] },
  { label: "100% on delivery", parts: [["On delivery", 100]] },
] as const;

export function PaymentsPanel({
  projectId,
  payments,
  fixedPrice,
  currency,
}: {
  projectId: number;
  payments: Payment[];
  fixedPrice: number | null;
  currency: string;
}) {
  const { pending, exec } = useAction();
  const scheduled = payments.reduce((s, p) => s + p.amount, 0);
  const paid = payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  const today = toDateString(new Date());

  async function applyTemplate(parts: readonly (readonly [string, number])[]) {
    for (const [label, percent] of parts) {
      const fd = new FormData();
      fd.set("projectId", String(projectId));
      fd.set("label", `${percent}% ${label.toLowerCase()}`);
      fd.set("percent", String(percent));
      await exec(() => createPayment(fd));
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Summary label="Price" value={formatMoney(fixedPrice ?? scheduled, currency)} />
        <Summary label="Paid" value={formatMoney(paid, currency)} tone="good" />
        <Summary
          label="Outstanding"
          value={formatMoney((fixedPrice ?? scheduled) - paid, currency)}
          tone={(fixedPrice ?? scheduled) - paid > 0 ? "warn" : undefined}
        />
      </div>

      {payments.length > 0 ? (
        <div className="divide-y rounded-xl border">
          {payments.map((p) => {
            const overdue = !p.paidAt && p.dueDate && p.dueDate < today;
            return (
              <div key={p.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                <Checkbox
                  checked={p.paidAt != null}
                  onCheckedChange={(checked) => exec(() => setPaymentPaid(p.id, checked ? today : null))}
                />
                <span className={cn("flex-1", p.paidAt && "text-muted-foreground line-through")}>{p.label}</span>
                <span className={cn("text-xs", overdue ? "font-medium text-red-500" : "text-muted-foreground")}>
                  {p.paidAt ? `paid ${formatDate(p.paidAt, "d MMM")}` : p.dueDate ? `due ${formatDate(p.dueDate, "d MMM")}` : ""}
                </span>
                <span className="w-28 text-right font-medium tabular-nums">{formatMoney(p.amount, currency)}</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => confirm("Delete this payment?") && exec(() => deletePayment(p.id))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        fixedPrice != null && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Quick schedule:
            {TEMPLATES.map((t) => (
              <Button key={t.label} size="sm" variant="outline" disabled={pending} onClick={() => applyTemplate(t.parts)}>
                {t.label}
              </Button>
            ))}
          </div>
        )
      )}

      <form
        className="grid grid-cols-[1fr_5rem_8rem_9rem_auto] items-end gap-2 rounded-xl border p-3"
        action={async (fd) => {
          await exec(() => createPayment(fd), "Payment added");
        }}
      >
        <input type="hidden" name="projectId" value={projectId} />
        <Input name="label" placeholder="Label, e.g. 40% upfront" required />
        <Input name="percent" type="number" min={0} max={100} placeholder="%" disabled={fixedPrice == null} />
        <Input name="amount" inputMode="decimal" placeholder="or amount" />
        <Input name="dueDate" type="date" title="Due date" />
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
      </form>
      {fixedPrice == null && (
        <p className="text-xs text-muted-foreground">Set a fixed price on the project to schedule payments by percentage.</p>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}
