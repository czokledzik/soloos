# Overnight run (2026-10-09 → 10)

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
