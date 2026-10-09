"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/form";
import { useAction } from "./use-action";

/** Markdown textarea that saves on blur. */
export function NotesEditor({
  initial,
  save,
  placeholder = "Notes, links, credentials location, scope…",
  className,
}: {
  initial: string;
  save: (value: string) => Promise<ActionResult<unknown>>;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const { pending, exec } = useAction();
  return (
    <div className="grid gap-1">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== initial && exec(() => save(value))}
        placeholder={placeholder}
        className={cn("min-h-64 font-mono text-sm", className)}
      />
      <span className="h-4 text-xs text-muted-foreground">{pending ? "Saving…" : ""}</span>
    </div>
  );
}
