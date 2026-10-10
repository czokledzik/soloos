# Overnight run (2026-10-09 → 10)

## Before you merge

- **Nothing is pushed.** Branch `overnight/tests-and-roadmap` exists only in `~/src/soloos` on the machine that ran this.
  Merging to `main` deploys to Vercel and runs migrations 0002–0006 on Neon. They only add tables and columns; I ran
  the upgrade against a copy of `main`'s schema with data and nothing was lost.
- **New, optional env vars** (README has details): `MCP_TOKEN` (Claude Code), `IMAP_HOST`/`IMAP_USER`/`IMAP_PASSWORD`
  + `CRON_SECRET` (email), `AI_PROVIDER` + `ANTHROPIC_API_KEY` or `AI_RUNNER_TOKEN` (Claude buttons). Without them
  those features stay off; everything else works as before.
- **Your calls:** how to schedule the email sync (Vercel Hobby only allows daily crons), and whether Claude buttons
  use the API (costs per use) or the local runner (your subscription, needs an always-on machine).
- **Not verified against the real thing:** Hostinger IMAP, the Anthropic API, the `claude` CLI runner, and
  claude.ai's connector UI (no credentials here). Each has tests with fakes or a local stand-in.
- `pnpm test` needs a Postgres at `TEST_DATABASE_URL`; `pnpm test:e2e` additionally needs Chromium.

Branch `overnight/tests-and-roadmap`, local only (not pushed: a push to `main` deploys and migrates production).

## Plan
1. [x] Test setup: Vitest (unit + integration against a real Postgres `soloos_test`), Playwright e2e smoke
2. [x] Tests for lib, importers, server actions (timer rules, billing, CRM), fix bugs found
3. [x] PLAN §6.2 Messages model: threads, messages, participants, merged timeline, convert pasted interactions
4. [ ] PLAN §6.3 Imports: Telegram Desktop JSON, paste-and-fix splitter (IMAP sync: parser/sync logic only, no credentials here)
5. [x] PLAN §6.4 Project docs: brief, decision log, change requests, doc pages with revisions + Mermaid, systems list
6. [x] PLAN §6.5 MCP server (if time)

## Log
- Test setup done: `pnpm test` (115 unit + integration tests against real Postgres), `pnpm test:e2e` (15 Playwright tests incl. login gate).
- Bugs fixed (each has a regression test):
  - Linear import: non-ISO due dates landed one day early; error line numbers wrong after skipped rows.
  - Timer: two quick starts collided on the singleton row ("Something went wrong"); now serialized with an advisory lock.
  - Re-saving a done task reset its completion time.
  - Login `?next=` open redirect via `/\evil.com`.
  - Free-text currency like "zł" would crash any page rendering money; now validated (3-letter code) and formatting falls back safely.
- Messages (PLAN §6.2/6.3) done: `threads` / `thread_participants` / `messages` (migration 0002, additive only).
  - /messages (list + full-text-ish search), /messages/new (paste and fix), /messages/[id] (thread page).
  - Paste splitter recognizes WhatsApp exports, Telegram Desktop copies, Messenger copies, "Name: text" logs.
  - Logged conversations get a ✂ "Split into messages" button that converts them (the interaction is replaced).
  - Telegram Desktop JSON import in Settings: preview, client per chat (auto-suggested from contacts), dedupe by message id.
  - Client/lead/project timelines show thread activity per day, interleaved with conversations and events.
  - Decision: existing interactions are NOT bulk-migrated (they're also used for call/meeting notes); convert per item instead.
- Also fixed: link-styled buttons (`buttonVariants` on `<Link>`) lost their outline border app-wide.
- Project docs (PLAN §6.4) done (migration 0003, additive): brief on Overview; Scope tab (baseline, change requests,
  decision log, totals incl. approved changes); Docs tab (markdown pages, live preview, Mermaid with pan/zoom,
  revision history + restore, systems list that refuses credentials).
- Fixed app-wide: forms wiped all input when the server returned a validation error (React 19 `<form action>` reset).
- MCP server (PLAN §6.5) done: `/api/mcp`, 14 tools (8 read, 6 write, no deletes), OAuth 2.1 for claude.ai connectors
  (stateless signed tokens, consent page behind the normal login), `MCP_TOKEN` for Claude Code. See README → Claude (MCP).
- Email via IMAP (PLAN §6.3) done: only mail involving known contact addresses, threaded by Message-ID/References,
  quoted history stripped, dedupe by Message-ID, resumes by UID per mailbox (migration 0004 adds `app_state`).
  Settings → Email → Sync now; `/api/cron/email-sync` for schedulers. **Not scheduled automatically**: Vercel Hobby
  only allows daily crons, so the schedule is your call (see README → Messages).
  Verified the IMAP client path (search/fetch/UID resume) against a local fake IMAP server (hoodiecrow); not against
  Hostinger itself (no credentials here).
- Client portal (PLAN §6.7) done (migration 0005, additive): project → Portal tab turns on a `/p/<token>` link
  (32 random bytes, "New link" rotates it, "Turn off" kills it). Shows task progress, published updates and published
  doc pages (Mermaid with pan/zoom), never rates/hours/notes/messages; `noindex`; no AI anywhere near it.
- In-app AI (PLAN §6.6) done (migration 0006 adds `ai_jobs`): thread "Summarize & extract", project "Draft the brief",
  lead "Draft a reply". Suggestions only, each accepted by a click. Provider `api` (Anthropic SDK, claude-opus-5-5,
  structured outputs, `fallbacks: "default"`) or `runner` (queue + `pnpm ai:runner` driving your Claude Code CLI with
  no tools / no MCP, since prompts contain untrusted client text). **Not run against the real API or CLI** (no key here,
  and I didn't spend your subscription): request shape, refusal/error handling, queue, schema validation and CLI output
  parsing are tested with fakes; the browser test plays the runner over HTTP.
- Telegram import reworked: `result.json` is parsed in the browser and only chosen chats are sent, 1000 messages per
  request (Vercel caps request bodies at ~4.5 MB; full exports are much bigger). Note: the existing Clockify/Linear
  CSV upload has the same cap on Vercel despite `bodySizeLimit: 20mb`; fine for normal exports, not changed.
- Extra: `/search` (clients, contacts, projects, tasks, leads, messages, logged conversations, decisions, docs) with a
  "Search everything" entry at the bottom of ⌘K; the MCP `search` tool uses the same query.
