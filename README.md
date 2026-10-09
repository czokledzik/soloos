# SoloOS

Personal ops app for freelance/side-business work: projects, tasks, time tracking, payments, and a light CRM (lead pipeline, conversation log, client timeline).
Single user. Runs locally for development and on Vercel + Neon in production. See [PLAN.md](PLAN.md) for scope and roadmap.

## Stack

Next.js 16 (App Router, server actions) · React 19 · Tailwind 4 + shadcn/ui (Base UI) · Postgres 17 · Drizzle ORM

## Setup

```bash
brew install node pnpm postgresql@17
brew services start postgresql@17
createdb soloos

cp .env.example .env        # set DATABASE_URL (e.g. postgres://$USER@localhost:5432/soloos)
pnpm install
pnpm db:migrate
pnpm db:seed                # "Personal" internal client + SoloOS project
pnpm dev                    # http://127.0.0.1:3000
```

The dev server binds to `127.0.0.1` and runs without a password. Set `APP_PASSWORD` to require a login (always required in production).

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server on 127.0.0.1:3000 |
| `pnpm typecheck` | Generate route types + `tsc` |
| `pnpm db:generate` | Create a migration from `src/db/schema.ts` changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio (DB browser) |
| `pnpm db:seed` | Seed base data (idempotent) |
| `pnpm test` | Unit + integration tests (Vitest, against the `soloos_test` database) |
| `pnpm test:e2e` | Browser tests (Playwright, production build on :3100 against `soloos_e2e`) |
| `pnpm backup` | Run the production backup now (triggers the GitHub Action) |

## Tests

- `pnpm test` runs pure unit tests (`src/**/*.test.ts`) and integration tests (`test/integration/`) that call
  server actions and queries against a real Postgres. The database comes from `TEST_DATABASE_URL`
  (default `postgres://127.0.0.1:5432/soloos_test`); it's created and migrated automatically and truncated
  before each test, so the name must contain "test".
- `pnpm test:e2e` builds the app into `.next-e2e`, serves it on port 3100 with `APP_PASSWORD=e2e-password`,
  and drives it with Chromium. The `soloos_e2e` database (`E2E_DATABASE_URL`) is dropped and re-migrated on
  every run. First time: `pnpm exec playwright install chromium` (add `--with-deps` on Linux).
  The flow tests in `e2e/flows.spec.ts` build on each other and run in order.

## Deploying (Vercel + Neon)

- Production is the `main` branch on Vercel, with a Neon Postgres database (Frankfurt) connected through Vercel's Storage integration.
  The integration sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
- Required env var: `APP_PASSWORD`. Optional: `APP_TIMEZONE` (default `Europe/Warsaw`), `NEXT_PUBLIC_OFERTOWNIK_URL`.
- `vercel.json` pins functions to `fra1` (next to the database) and builds with `scripts/vercel-build.sh`,
  which runs `pnpm db:migrate` on production deploys only. Preview deploys never touch the schema.
- Dev and prod are separate databases: develop against local Postgres, ship schema changes as migration files.

## Backups

The production database (Neon) is dumped nightly (~20:00) by a GitHub Action in the private repo
`your-user/soloos-backups` and committed as `soloos.sql`; git history is the retention.
The Action's `DATABASE_URL` secret is Neon's direct (unpooled) connection string.
Neon's own point-in-time restore covers the last few hours on top of that.

Restore: `psql "<empty database>" -f soloos.sql`. For older versions see the backups repo README.
The local dev database isn't backed up.

## Importing history

Settings → Import: Clockify detailed-report CSV (time entries) and Linear CSV (issues → tasks).
Preview first; re-importing the same file skips rows already imported.

## Keyboard

- `⌘K` — command palette: jump anywhere, start a timer on any project/task, create task/project, log time
- `⌥S` — stop the running timer, or resume the last one

Set `NEXT_PUBLIC_OFERTOWNIK_URL` in `.env` to turn proposal slugs on leads into links.

## Layout

```
src/db/schema.ts        tables, enums, relations
src/server/actions.ts   all mutations (server actions)
src/server/queries.ts   all reads
src/lib/                formatting, labels, billing rules
src/components/app/     app components (timer, board, forms, …)
src/components/ui/      shadcn primitives
src/app/(app)/          pages
```
