import { describe, expect, it } from "vitest";
import { findSecret } from "./secrets";

describe("findSecret", () => {
  it.each([
    ["postgres://app:hunter22@db.neon.tech/soloos", "a password inside a URL"],
    ["key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "an Anthropic API key"],
    ["sk-proj-abcdefghijklmnopqrstuvwx", "an OpenAI-style API key"],
    ["sk_" + "a1".repeat(24), "an ElevenLabs API key"],
    ["ghp_" + "A".repeat(36), "a GitHub token"],
    ["AKIAIOSFODNN7EXAMPLE", "an AWS access key"],
    ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", "a JWT / API token"],
    ["Hasło: Tajne123!", "a password or key"],
    ["api_key=abcdef123456", "a password or key"],
    ["-----BEGIN OPENSSH PRIVATE KEY-----", "a private key"],
  ])("flags %s", (text, what) => {
    expect(findSecret(text)).toBe(what);
  });

  it.each([
    "https://github.com/czokledzik/soloos",
    "https://n8n.example.com/workflow/42",
    "Password is in 1Password, vault Clients",
    "token rotation every 90 days",
    "mailto:anna@example.com",
    "",
    null,
  ])("lets %s through", (text) => {
    expect(findSecret(text)).toBeNull();
  });
});
