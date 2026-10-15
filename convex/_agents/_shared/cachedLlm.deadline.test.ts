import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uncachedLlmCall } from "./cachedLlm.js";

vi.mock("../../_lib/env.js", () => ({
  env: { TOGETHER_AI_API_KEY: "test-key" },
}));

const okResponse = () => ({
  ok: true,
  text: async () =>
    JSON.stringify({ choices: [{ message: { content: "done" }, finish_reason: "stop" }] }),
});

/** A fetch that only settles when its abort signal fires, like a stalled Together request. */
const hangingFetch = (_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

const request = {
  model: "Qwen/Qwen3.5-9B",
  messages: [{ role: "user" as const, content: "hi" }],
  temperature: 0.1,
};

describe("uncachedLlmCall timeoutMs", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts a stalled request at the deadline instead of waiting it out", async () => {
    fetchMock.mockImplementation(hangingFetch);

    await expect(uncachedLlmCall({ ...request, timeoutMs: 50 })).rejects.toThrow(
      /timed out after 50ms/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts no retry that would run past the deadline", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "busy" });
    const started = Date.now();

    // The first retry backs off at least 450ms, past a 100ms deadline.
    await expect(uncachedLlmCall({ ...request, timeoutMs: 100 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("sends no abort signal when no deadline is set", async () => {
    fetchMock.mockResolvedValue(okResponse());

    await uncachedLlmCall(request);

    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });

  it("turns Qwen3.5-9B thinking off when reasoning is disabled", async () => {
    fetchMock.mockResolvedValue(okResponse());

    await uncachedLlmCall({ ...request, reasoningEnabled: false });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.reasoning).toEqual({ enabled: false });
  });
});
