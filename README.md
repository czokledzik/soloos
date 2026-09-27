# SoloOS

Personal ops app for freelance/side-business work: projects, tasks, time tracking, payments and (soon) a light CRM.
Single user, runs locally. See [PLAN.md](PLAN.md) for scope and roadmap.

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

The dev server binds to `127.0.0.1` only — there is no auth yet, so don't expose it.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server on 127.0.0.1:3000 |
| `pnpm typecheck` | Generate route types + `tsc` |
| `pnpm db:generate` | Create a migration from `src/db/schema.ts` changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio (DB browser) |
| `pnpm db:seed` | Seed base data (idempotent) |

## Keyboard

- `⌘K` — command palette: jump anywhere, start a timer on any project/task, create task/project, log time
- `⌥S` — stop the running timer, or resume the last one

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
