"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/form";

/**
 * Runs a server action in a transition, toasting on failure (and on success
 * when a message is given). Resolves to the action's result.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  function exec<R extends ActionResult<unknown>>(fn: () => Promise<R>, success?: string): Promise<R> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) {
          if (success) toast.success(success);
        } else {
          toast.error(res.error);
        }
        resolve(res);
      });
    });
  }
  return { pending, exec };
}
