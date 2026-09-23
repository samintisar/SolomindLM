import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenAIEmbeddings, EmbeddingService } from "./embeddingClient";

function mockOpenAIResponse(vectors: number[][]) {
  return {
    ok: true,
    text: async () =>
      JSON.stringify({
        data: vectors.map((embedding, index) => ({ index, embedding, object: "embedding" })),
      }),
    json: async () => ({
      data: vectors.map((embedding, index) => ({ index, embedding, object: "embedding" })),
    }),
  };
}

describe("callOpenAIEmbeddings", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty array without calling fetch for empty input", async () => {
    const result = await callOpenAIEmbeddings([], "test-key");
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends model, dimensions, and input, and returns vectors in request order", async () => {
    fetchMock.mockResolvedValue(
      mockOpenAIResponse([
        [0.1, 0.2],
        [0.3, 0.4],
      ])
    );

    const result = await callOpenAIEmbeddings(["first", "second"], "test-key");

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: "text-embedding-3-small",
      input: ["first", "second"],
      dimensions: 1536,
    });
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("re-sorts out-of-order response items back to request order", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "",
      json: async () => ({
        data: [
          { index: 1, embedding: [0.9, 0.9] },
          { index: 0, embedding: [0.1, 0.1] },
        ],
      }),
    });

    const result = await callOpenAIEmbeddings(["a", "b"], "test-key");
    expect(result).toEqual([
      [0.1, 0.1],
      [0.9, 0.9],
    ]);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid api key",
    });

    await expect(callOpenAIEmbeddings(["x"], "bad-key")).rejects.toThrow();
  });

  it("throws when the response vector count doesn't match the request count", async () => {
    fetchMock.mockResolvedValue(mockOpenAIResponse([[0.1, 0.1]]));

    await expect(callOpenAIEmbeddings(["a", "b"], "test-key")).rejects.toThrow(/expected 2/);
  });
});

describe("EmbeddingService", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("embedText trims input and returns a single vector", async () => {
    fetchMock.mockResolvedValue(mockOpenAIResponse([[0.5, 0.5]]));
    const service = new EmbeddingService("test-key");

    const result = await service.embedText("  hello world  ");

    expect(result).toEqual([0.5, 0.5]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toEqual(["hello world"]);
  });

  it("embedBatch splits large inputs across multiple calls at the configured batch size", async () => {
    const texts = Array.from({ length: 70 }, (_, i) => `chunk-${i}`);
    fetchMock
      .mockResolvedValueOnce(mockOpenAIResponse(Array.from({ length: 64 }, () => [1])))
      .mockResolvedValueOnce(mockOpenAIResponse(Array.from({ length: 6 }, () => [2])));

    const service = new EmbeddingService("test-key");
    const result = await service.embedBatch(texts);

    expect(result).toHaveLength(70);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
