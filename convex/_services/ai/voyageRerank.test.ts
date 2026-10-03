import { afterEach, describe, expect, it, vi } from "vitest";
import { RERANK_MODEL, RERANK_TIMEOUT_MS } from "../../_lib/rerankConfig";
import { callVoyageRerank } from "./voyageRerank";

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stubFetch(impl: (...args: unknown[]) => unknown) {
  fetchMock.mockImplementation(impl);
  vi.stubGlobal("fetch", fetchMock);
}

describe("callVoyageRerank", () => {
  it("posts the query and documents to Voyage and returns index + score pairs", async () => {
    stubFetch(async () =>
      Response.json({
        object: "list",
        data: [
          { index: 1, relevance_score: 0.82 },
          { index: 0, relevance_score: 0.38 },
        ],
        model: RERANK_MODEL,
        usage: { total_tokens: 27 },
      })
    );

    const hits = await callVoyageRerank("cats?", ["bread", "cats eat meat"], "pa-key", 15);

    expect(hits).toEqual([
      { index: 1, relevance_score: 0.82 },
      { index: 0, relevance_score: 0.38 },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.voyageai.com/v1/rerank");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pa-key");
    expect(JSON.parse(init.body as string)).toEqual({
      model: RERANK_MODEL,
      query: "cats?",
      documents: ["bread", "cats eat meat"],
      top_k: 15,
    });
  });

  it("skips the network call when there is nothing to rerank", async () => {
    stubFetch(async () => Response.json({}));

    expect(await callVoyageRerank("q", [], "pa-key", 5)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a service error carrying the HTTP status on a non-2xx response", async () => {
    stubFetch(async () => new Response('{"detail":"Invalid API key"}', { status: 401 }));

    await expect(callVoyageRerank("q", ["d"], "bad", 5)).rejects.toThrow(/voyage HTTP 401/);
  });

  it("rejects a malformed success payload instead of returning garbage", async () => {
    stubFetch(async () => Response.json({ data: "nope" }));

    await expect(callVoyageRerank("q", ["d"], "pa-key", 5)).rejects.toThrow(/malformed/);
  });

  it("bounds the request with an abort signal so an outage cannot stall chat", async () => {
    stubFetch(async () => Response.json({ data: [] }));

    await callVoyageRerank("q", ["d"], "pa-key", 5);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(RERANK_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
