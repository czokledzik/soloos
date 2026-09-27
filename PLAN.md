# SoloOS: plan (v3)

A single-user app for side-business work. Agency work stays in ClickUp.
**Current focus: project management, time tracking, and a light CRM.** Portal, proposals, and AI come later (section 6).

## 1. Stack (aligned with ofertownik)

| Concern | Choice | Note |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript | Same as ofertownik, so patterns and components carry over |
| Styling | Tailwind 4 + shadcn/ui | |
| DB | Postgres 17 (Homebrew service) + Drizzle ORM | Local; can point at Supabase/Neon later with no code change |
| Auth | None while localhost-only | Bind to `127.0.0.1`; add ofertownik-style `jose` admin cookie on deploy |
| Repo | Private GitHub `soloos` | see README for setup |

## 2. MVP scope

### Screens
1. **Today** (home)
   - The running timer, plus hours today and this week split by client.
   - My tasks: in progress, due soon, and overdue.
   - Follow-ups due: opportunities whose `next_action_at` is today or earlier.
2. **Projects**
   - Project list with status, client, hours this month, and budget/price progress.
   - Project page with four tabs:
     - **Tasks:** list and board, with drag between statuses and a start-timer button on each task.
     - **Time:** entries for this project.
     - **Payments:** e.g. 40% upfront (paid), 60% on delivery (due).
     - **Overview:** notes (markdown), plus hours vs budget and, for fixed price, effective hourly rate.
3. **My work:** all open tasks across projects, grouped by status or by project.
4. **Time**
   - Week timesheet (rows = project/task, columns = days, editable cells).
   - Entries list with filters.
   - Manual add and edit.
5. **Reports:** pick a period and group by client / project / task. Shows hours, billable amount (hours × rate), fixed-price burn, and payments due. CSV export (PDF later).
6. **Pipeline:** opportunity kanban by stage.
   - Quick-add lead: paste the Facebook post, group name, and link. This creates the organization, contact, and opportunity in one step.
   - Each card shows its next action and date.
7. **Clients** (organizations)
   - List with status (lead / active / past / internal).
   - Detail page tabs: **Timeline** (interactions + opportunities + projects), **Contacts**, **Projects**, **Info**.
8. **Log interaction** (a modal reachable from anywhere): channel, date, direction, and the pasted conversation, attached to a client and optionally an opportunity or project.
9. **`Cmd+K`:** jump to anything, start a timer on a task, create a task, log an interaction, or add a lead.

### Timer rules
- Only one timer runs at a time. It is stored in the DB, so it survives reloads and closed tabs.
- Starting a timer on another task stops the current one.
- Timer on a project with no task is allowed.
- Stopping a timer creates a `time_entry`. Entries under 1 min are discarded.
- Keyboard shortcut to stop and resume the last timer.

### Data model (MVP subset)

```
organizations   id, name, kind (company|person), status (lead|active|past|internal),
                website, default_rate, currency, notes_md, created_at
contacts        id, org_id, name, role, emails[], phone, telegram, facebook_url, linkedin_url

opportunities   id, org_id, contact_id?, title, stage (new|contacted|call|proposal|
                negotiating|won|lost), source (fb_group|referral|email|other),
                source_detail, source_url, original_post_md, est_value,
                next_action, next_action_at, lost_reason, project_id?, offer_slug?

interactions    id, org_id, contact_id?, opportunity_id?, project_id?,
                channel (facebook|email|telegram|whatsapp|call|meeting|other),
                direction (in|out|both|internal), occurred_at, title, body_md

projects        id, org_id, name, status (planned|active|paused|done|archived),
                contract_type (umowa_zlecenie|umowa_o_dzielo|b2b|useme|bizky|internal),
                pricing (hourly|fixed|none), hourly_rate, fixed_price, budget_hours,
                currency, start_date, due_date, notes_md
payments        id, project_id, label, percent?, amount, due_date, paid_at

tasks           id, project_id, title, body_md, status (backlog|todo|in_progress|
                review|done), priority (0-3), due_date, estimate_min, sort_order,
                completed_at
time_entries    id, project_id, task_id?, started_at, ended_at, duration_min,
                note, billable, rate_snapshot
running_timer   singleton: project_id, task_id?, started_at, note
```

Rules:
- Personal projects go under one `internal` organization, with `pricing = none` and billable = false.
- The rate is resolved as project rate, then client default, then none, and snapshotted on each entry.
- Money is stored as integer grosze/cents.

### Import
- Clockify detailed-report CSV creates `time_entries`, plus organizations and projects by name.
- Linear CSV creates `tasks`.

## 3. Build order

Status (2026-09-27): **The MVP (M1–M6) is done**, including nightly backups to a private GitHub repo. Next candidates are in section 6.

| # | Milestone | Done when |
|---|---|---|
| M1 | Scaffold: repo, Docker Postgres, Drizzle schema + migrations, seed, app shell (sidebar, `Cmd+K`) | `pnpm dev` shows empty app with seeded data |
| M2 | Clients + projects + tasks (list/board, task detail) | Can run a real project in it |
| M3 | Timer + time entries + week timesheet | Clockify no longer needed |
| M4 | Pipeline + quick-add lead + interactions + client timeline | New FB leads go here |
| M5 | Today dashboard + reports + CSV export + Clockify/Linear import | History migrated, weekly review possible |
| M6 | Payments on projects + effective-rate view | Umowa-zlecenie client tracked properly |

## 4. Relationship to ofertownik

Ofertownik: Next 16 + Supabase, offers at `/o/[slug]`, `offer_events` (view / section / heartbeat), comments, jose admin auth. Deployed on Vercel.

Keep it separate for now.
- In the MVP, an opportunity can store `offer_slug` so it links to the offer.
- Later, SoloOS reads `offer_events` and `offer_comments` from ofertownik's Supabase using a read-only key. That surfaces "opened / time per section / comments" on the opportunity timeline with no migration.
- Merging the two codebases only makes sense once SoloOS is deployed too.

## 5. Conventions
- Server components + server actions for CRUD, with no separate REST API until MCP/n8n needs one.
- Zod validation on all actions.
- Every table has `created_at`/`updated_at`, and deletes are soft (`archived_at`) for organizations, projects, and tasks.
- Nightly `pg_dump` to a cloud-synced folder via a launchd job.

## 6. Later (not in MVP)
- **MCP server** so Claude Code/Desktop, using your subscription, can summarize pasted conversations and transcripts, enrich leads, draft updates, and log time.
- **Client portal** (`/p/<token>`) + progress-report PDF. Requires deploying (VPS or Vercel + hosted Postgres) and adding auth.
- **Ofertownik stats** on opportunities, and eventually merging it in as a module.
- **Useme/Bizky** period summary export.
- Transcripts on interactions with AI summary and action items → tasks.
- Telegram JSON / `.eml` import, IMAP sync, and read-only ClickUp sync.

## 7. Open question
- Should the UI be in Polish or English? (Ofertownik is in Polish.)
