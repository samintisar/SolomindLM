import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scrape = vi.fn();

vi.mock("../../_lib/env", () => ({ env: { SUPADATA_API_KEY: "test-supadata-key" } }));
vi.mock("@supadata/js", () => ({
  Supadata: class {
    web = { scrape };
  },
  SupadataError: class extends Error {
    error = "internal-error";
  },
}));

const { SCRAPE_ATTEMPT_TIMEOUT_MS, SCRAPE_BUDGET_MS, WebLoaderService } = await import(
  "./WebLoaderService"
);

/** Settles `promise` under fake timers, reporting how much fake time passed. */
async function settle<T>(promise: Promise<T>) {
  const start = Date.now();
  const outcome = promise.then(
    (value) => ({ value, error: undefined, elapsed: Date.now() - start }),
    (error: Error) => ({ value: undefined, error, elapsed: Date.now() - start })
  );
  await vi.advanceTimersByTimeAsync(SCRAPE_BUDGET_MS + 60_000);
  return outcome;
}

describe("WebLoaderService.loadWebPageWithMeta", () => {
  beforeEach(() => {
    scrape.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the cleaned page and its title", async () => {
    scrape.mockResolvedValue({ content: "Body ![x](https://a.example/x.png) text", name: "T" });
    const { value } = await settle(
      new WebLoaderService().loadWebPageWithMeta("https://example.org/a")
    );
    expect(value).toEqual({ title: "T", content: "Body  text", url: "https://example.org/a" });
  });

  it("gives up on a scrape that never answers after one attempt's timeout", async () => {
    scrape.mockReturnValue(new Promise(() => undefined));
    const { error, elapsed } = await settle(
      new WebLoaderService().loadWebPageWithMeta("https://example.org/a")
    );
    expect(error?.message).toMatch(/timeout/);
    expect(elapsed).toBe(SCRAPE_ATTEMPT_TIMEOUT_MS);
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  it("keeps slow rate-limited retries inside the total budget", async () => {
    scrape.mockImplementation(
      () =>
        new Promise((_, reject) => setTimeout(() => reject(new Error("429 rate limit")), 20_000))
    );
    const { error, elapsed } = await settle(
      new WebLoaderService().loadWebPageWithMeta("https://example.org/a")
    );
    expect(error).toBeInstanceOf(Error);
    expect(elapsed).toBeLessThanOrEqual(SCRAPE_BUDGET_MS);
    expect(scrape.mock.calls.length).toBeLessThan(5);
  });

  it("still retries a fast rate limit", async () => {
    scrape
      .mockRejectedValueOnce(new Error("Limit exceeded"))
      .mockResolvedValue({ content: "ok", name: "" });
    const { value } = await settle(
      new WebLoaderService().loadWebPageWithMeta("https://example.org/a")
    );
    expect(value?.content).toBe("ok");
    expect(scrape).toHaveBeenCalledTimes(2);
  });
});
