// Local AI runner: lets SoloOS use Claude through your own Claude Code CLI (and
// subscription) on an always-on machine instead of an API key.
//
//   SOLOOS_URL=https://soloos.example AI_RUNNER_TOKEN=... pnpm ai:runner
//
// Set AI_PROVIDER=runner and the same AI_RUNNER_TOKEN on the server. The runner
// polls for queued jobs, runs `claude -p` with no tools, and posts the answer back.
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeArgs, parseClaudeOutput, type RunnerJob } from "./ai-runner-lib";

const base = (process.env.SOLOOS_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const token = process.env.AI_RUNNER_TOKEN;
const model = process.env.AI_RUNNER_MODEL;
const pollMs = Number(process.env.AI_RUNNER_POLL_MS || 5000);
if (!token) throw new Error("Set AI_RUNNER_TOKEN (the same value as on the server)");

const api = (path: string, body?: object) =>
  fetch(`${base}/api/ai/runner/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

async function runClaude(job: RunnerJob): Promise<unknown> {
  const cwd = await mkdtemp(join(tmpdir(), "soloos-ai-"));
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.env.CLAUDE_BIN ?? "claude", claudeArgs(job, model), { cwd, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`claude exited with ${code}: ${err.slice(0, 500)}`))));
      child.stdin.end(job.prompt);
    });
    return parseClaudeOutput(stdout);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function tick() {
  const res = await api("claim");
  if (res.status === 204) return false;
  if (!res.ok) throw new Error(`claim failed: ${res.status} ${await res.text()}`);
  const job = (await res.json()) as RunnerJob;
  console.log(`[${new Date().toISOString()}] job ${job.id} (${job.kind})`);
  try {
    const result = await runClaude(job);
    const done = await (await api("complete", { id: job.id, result })).json();
    console.log(`  → ${done.status}${done.error ? `: ${done.error}` : ""}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`  → failed: ${error}`);
    await api("complete", { id: job.id, error });
  }
  return true;
}

async function main() {
  console.log(`SoloOS AI runner polling ${base} every ${pollMs / 1000}s`);
  for (;;) {
    try {
      // Drain the queue, then wait.
      while (await tick());
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

main();
