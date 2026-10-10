// Pieces of the local AI runner that don't need a network or a CLI (tested in test/ai-runner.test.ts).

export type RunnerJob = { id: number; kind: string; system: string; prompt: string; schema: object };

/**
 * Arguments for a locked-down, one-shot `claude -p` call. The prompt holds client
 * messages (untrusted text), so the CLI gets no tools and no MCP servers, and
 * runs in an empty temporary directory.
 */
export function claudeArgs(job: RunnerJob, model?: string): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(job.schema),
    "--system-prompt",
    job.system,
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    ...(model ? ["--model", model] : []),
  ];
}

/** Pulls the structured answer out of `claude -p --output-format json` output. */
export function parseClaudeOutput(stdout: string): unknown {
  const out = JSON.parse(stdout) as { is_error?: boolean; result?: unknown; structured_output?: unknown };
  if (out.is_error) throw new Error(typeof out.result === "string" ? out.result : "Claude Code reported an error");
  if (out.structured_output != null) return out.structured_output;
  if (typeof out.result !== "string") throw new Error("No result in Claude Code output");
  // Without structured output support, take the JSON object in the text (possibly fenced).
  const text = out.result.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}
