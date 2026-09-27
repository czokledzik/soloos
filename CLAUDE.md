@AGENTS.md

# SoloOS notes

- Plan and roadmap: PLAN.md. UI is English.
- Single-user, local app: root layout is `force-dynamic`; every mutation calls `revalidatePath("/", "layout")`.
- Mutations live in `src/server/actions.ts` (PM/time) and `src/server/crm-actions.ts` (clients, contacts, leads, interactions) and return `ActionResult` via `run()`; client code calls them through `useAction().exec`.
- Money is integer minor units (grosze). Rates are snapshotted on each time entry (`rate_snapshot`).
- shadcn here uses Base UI, not Radix: use `render` prop instead of `asChild`; for links styled as buttons use `buttonVariants`. Forms use `NativeSelect` + `Field` (label wraps the control).
- Schema changes: edit `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.
- Before committing: `pnpm typecheck && pnpm lint`.
- Reads: `src/server/queries.ts` and `src/server/crm-queries.ts`. Shared constants used by server components must not live in `"use client"` files (put them in `src/lib/`).
- Drag-and-drop boards use the generic `Kanban` component (`src/components/app/kanban.tsx`).
