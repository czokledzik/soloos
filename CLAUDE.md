@AGENTS.md

# SoloOS notes

- Plan and roadmap: PLAN.md. UI is English.
- Single-user, local app: root layout is `force-dynamic`; every mutation calls `revalidatePath("/", "layout")`.
- Mutations live in `src/server/actions.ts` and return `ActionResult` via `run()`; client code calls them through `useAction().exec`.
- Money is integer minor units (grosze). Rates are snapshotted on each time entry (`rate_snapshot`).
- shadcn here uses Base UI, not Radix: use `render` prop instead of `asChild`; for links styled as buttons use `buttonVariants`. Forms use `NativeSelect` + `Field` (label wraps the control).
- Schema changes: edit `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.
- Before committing: `pnpm typecheck && pnpm lint`.
