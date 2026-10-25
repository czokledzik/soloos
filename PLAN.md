# SoloOS: design notes and roadmap

A single-user ops app for freelance and side-business work: projects, tasks, time, payments, a light CRM,
messages, project docs and a client portal. The README shows what it does; this file records the rules behind it
and what may come next.

## Stack

| Concern | Choice | Note |
|---|---|---|
| App | Next.js 16 (App Router, server actions) + React 19 + TypeScript | |
| Styling | Tailwind 4 + shadcn/ui (Base UI) | |
| DB | Postgres 17 + Drizzle ORM | Local Postgres in development, Neon in production |
| Auth | Password (`APP_PASSWORD`), none on localhost | One user; the client portal and MCP have their own credentials |

## Rules

### Timer
- Only one timer runs at a time. It is stored in the DB, so it survives reloads and closed tabs.
- Starting a timer on another task stops the current one. A timer on a project with no task is allowed.
- Stopping a timer creates a time entry; entries under 1 min are discarded.
- `⌥S` stops the timer, or resumes the last one.

### Money and rates
- Money is stored as integer minor units (cents/grosze), with a currency per client and project.
- The hourly rate is resolved as project rate, then client default, then none, and snapshotted on each entry,
  so changing a rate never rewrites past work.
- Personal projects go under one `internal` client, with `pricing = none` and billable = false.

### Data
- Every table has `created_at`/`updated_at`; clients, projects and tasks are archived rather than deleted.
- Imports (Clockify, Linear, Telegram, email) dedupe by a source key, so re-importing never duplicates.
- Credentials are never stored: free text that could hold one is checked and refused.

### Project docs
Inspired by Wiegers, *Software Requirements Essentials*:
- **Brief:** short, edited in place, and the first thing anyone (or Claude) reads.
- **Decision log:** dated decisions with their source (message, call) and who decided.
- **Scope baseline and change requests:** requested by, impact on hours and price, status (proposed, approved, rejected).
  This matters most for fixed-price work.
- **Open questions** (who answers, needed by; answering one can log a decision) and **business rules** (rules in force,
  linked to the decision they came from and where they're implemented). Codes like Q-01 and BR-01 let doc pages and
  prompts cite them.
- **Doc pages** with revision history and Mermaid diagrams; templates for an automation / AI handover set
  (`src/lib/doc-templates.ts`, in Polish for now).
- **Systems:** links to repos, workflows, agents and databases. Never credentials; code and configs stay in git.

### Claude
- In-app buttons only suggest; every decision, task or change request is accepted by a click.
- The MCP server can read and update but never delete, and refuses credentials like the rest of the app.
- The client portal never uses AI.

## Roadmap

- Settings instead of hardcoded defaults: currency, timezone, contract types.
- Doc templates in English.
- One-click deploy (Deploy button) and Docker Compose for self-hosting.
- Scheduled email sync on hosts that allow frequent cron jobs.
- Period exports for invoicing platforms; full-text search upgrades (pgvector) if needed.
