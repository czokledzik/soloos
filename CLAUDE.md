@AGENTS.md

# SoloOS notes

- Plan and roadmap: PLAN.md. UI is English.
- Single-user, local app: root layout is `force-dynamic`; every mutation calls `revalidatePath("/", "layout")`.
- Mutations live in `src/server/actions.ts` (PM/time) and `src/server/crm-actions.ts` (clients, contacts, leads, interactions) and return `ActionResult` via `run()`; client code calls them through `useAction().exec`.
- Money is integer minor units (grosze). Rates are snapshotted on each time entry (`rate_snapshot`).
- shadcn here uses Base UI, not Radix: use `render` prop instead of `asChild`; for links styled as buttons use `buttonVariants`. Forms use `NativeSelect` + `Field` (label wraps the control).
- Schema changes: edit `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`.
- Before committing: `pnpm typecheck && pnpm lint && pnpm test`; `pnpm test:e2e` for UI changes (see README → Tests).
  Integration tests call server actions directly against the `soloos_test` database (helpers in `test/db.ts`).
- Forms submit with `onSubmit={submitForm(async (fd) => …)}`, not `<form action>`: React resets `action` forms after
  every submit, which wiped user input when an action returned a validation error.
- Never store credentials: free-text that could hold one goes through `findSecret` (`src/lib/secrets.ts`).
- Other mutations/reads: `message-actions.ts`/`message-queries.ts` (threads), `doc-actions.ts`/`doc-queries.ts`
  (brief, scope, decisions, change requests, doc pages, systems), `portal-*.ts`, `ai-actions.ts` + `src/server/ai/`,
  `src/server/mcp/` (MCP server + OAuth), `email.ts`/`email-sync.ts` (IMAP).
- Routes outside the login (`/api/mcp`, `/oauth/*`, `/.well-known/*`, `/api/cron/*`, `/api/ai/runner/*`, `/p/*`) check
  their own credentials; they're listed in `src/proxy.ts`.
- Reads: `src/server/queries.ts` and `src/server/crm-queries.ts`. Shared constants used by server components must not live in `"use client"` files (put them in `src/lib/`).
- Drag-and-drop boards use the generic `Kanban` component (`src/components/app/kanban.tsx`).
