# SoloOS

Personal ops app for freelance/side-business work: projects, tasks, time tracking, payments, and a light CRM (lead pipeline, conversation log, client timeline).
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
| `pnpm backup` | Dump the DB to the backups repo and push |
| `pnpm backup:install` | Install the nightly (20:00) launchd backup job; re-run after changing `backup.sh` or `.env` |
| `pnpm backup:uninstall` | Remove the launchd job |

## Backups

Nightly plain-SQL `pg_dump` committed to the private repo `your-user/soloos-backups`, cloned at
`~/Library/Application Support/SoloOS/soloos-backups` (launchd can't read `~/Documents`, so the job and its config live there too).
Git history is the retention: one commit per backup. Log: `~/Library/Logs/soloos-backup.log`.

On a new machine: `git clone https://github.com/your-user/soloos-backups.git "$HOME/Library/Application Support/SoloOS/soloos-backups"`, then `pnpm backup:install`.

Restore: `createdb soloos && psql -d soloos -f soloos.sql` (see the backups repo README for older versions).

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
