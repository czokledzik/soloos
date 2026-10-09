# Overnight run (2026-10-09 → 10)

Branch `overnight/tests-and-roadmap`, local only (not pushed: a push to `main` deploys and migrates production).

## Plan
1. [x] Test setup: Vitest (unit + integration against a real Postgres `soloos_test`), Playwright e2e smoke
2. [x] Tests for lib, importers, server actions (timer rules, billing, CRM), fix bugs found
3. [ ] PLAN §6.2 Messages model: threads, messages, participants, merged timeline, convert pasted interactions
4. [ ] PLAN §6.3 Imports: Telegram Desktop JSON, paste-and-fix splitter (IMAP sync: parser/sync logic only, no credentials here)
5. [ ] PLAN §6.4 Project docs: brief, decision log, change requests, doc pages with revisions + Mermaid, systems list
6. [ ] PLAN §6.5 MCP server (if time)

## Log
- Test setup done: `pnpm test` (115 unit + integration tests against real Postgres), `pnpm test:e2e` (15 Playwright tests incl. login gate).
- Bugs fixed (each has a regression test):
  - Linear import: non-ISO due dates landed one day early; error line numbers wrong after skipped rows.
  - Timer: two quick starts collided on the singleton row ("Something went wrong"); now serialized with an advisory lock.
  - Re-saving a done task reset its completion time.
  - Login `?next=` open redirect via `/\evil.com`.
  - Free-text currency like "zł" would crash any page rendering money; now validated (3-letter code) and formatting falls back safely.
