// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTurnstile } from "./useTurnstile";

const turnstileScripts = () =>
  document.head.querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]');

describe("useTurnstile", () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const script of turnstileScripts()) script.remove();
  });

  it("times out a script that never loads or errors, then starts a fresh load", async () => {
    vi.useFakeTimers();
    const container = { current: document.createElement("div") };
    const { result } = renderHook(() => useTurnstile(container));

    const first = result.current.getToken();
    const firstFailure = expect(first).rejects.toThrow("turnstile_load_timeout");
    expect(turnstileScripts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await firstFailure;
    // The stalled tag is gone, so a retry isn't stuck behind it.
    expect(turnstileScripts()).toHaveLength(0);

    const second = result.current.getToken();
    const secondFailure = expect(second).rejects.toThrow("turnstile_load_timeout");
    expect(turnstileScripts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await secondFailure;
  });
});
