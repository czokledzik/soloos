import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPassword, createSession, verifySession } from "./session";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("session", () => {
  it("is off without APP_PASSWORD", () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(checkPassword("")).toBe(false);
    expect(verifySession("123.abc")).toBe(false);
  });

  it("checks the password", () => {
    vi.stubEnv("APP_PASSWORD", "hunter2");
    expect(checkPassword("hunter2")).toBe(true);
    expect(checkPassword("hunter")).toBe(false);
  });

  it("accepts its own cookies, rejects tampered and expired ones", () => {
    vi.stubEnv("APP_PASSWORD", "hunter2");
    const { value } = createSession();
    expect(verifySession(value)).toBe(true);

    const [expires, sig] = value.split(".");
    expect(verifySession(`${Number(expires) + 1000}.${sig}`)).toBe(false);
    expect(verifySession(`${expires}.${sig.slice(0, -1)}x`)).toBe(false);
    expect(verifySession(undefined)).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(Number(expires) + 1);
    expect(verifySession(value)).toBe(false);
  });

  it("changing the password logs everyone out", () => {
    vi.stubEnv("APP_PASSWORD", "hunter2");
    const { value } = createSession();
    vi.stubEnv("APP_PASSWORD", "correct horse");
    expect(verifySession(value)).toBe(false);
  });
});
