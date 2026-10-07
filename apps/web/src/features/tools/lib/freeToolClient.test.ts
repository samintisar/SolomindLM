import { describe, expect, it, vi } from "vitest";
import { generateFreeDeck } from "./freeToolClient";

const req = { text: "words", cardCount: 20 as const, turnstileToken: "tok" };
const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("generateFreeDeck", () => {
  it("returns the deck and drops null topics", async () => {
    const fetchImpl = respond(200, {
      title: "Cells",
      cards: [{ type: "definition", front: "Define: cell", back: "Unit of life", topic: null }],
    });
    const result = await generateFreeDeck(req, fetchImpl);
    expect(result).toEqual({
      kind: "ok",
      deck: {
        title: "Cells",
        cards: [{ type: "definition", front: "Define: cell", back: "Unit of life" }],
      },
    });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/\/tools\/flashcards$/);
  });

  it("falls back to a default title when the response has none", async () => {
    const cards = [{ type: "definition", front: "Define: cell", back: "Unit of life" }];
    for (const title of [undefined, "", "   ", 7]) {
      const result = await generateFreeDeck(req, respond(200, { title, cards }));
      expect(result).toMatchObject({ kind: "ok", deck: { title: "Flashcards" } });
    }
  });

  it("maps 400, 403, 429 and 5xx", async () => {
    expect(await generateFreeDeck(req, respond(400, { error: "text_too_short" }))).toEqual({
      kind: "invalid",
      error: "text_too_short",
    });
    expect(await generateFreeDeck(req, respond(403, { error: "captcha_failed" }))).toEqual({
      kind: "captcha",
    });
    expect(
      await generateFreeDeck(
        req,
        respond(429, { error: "rate_limited", scope: "ip", retryAfterMs: 5 })
      )
    ).toEqual({ kind: "limited", scope: "ip", retryAfterMs: 5 });
    expect(await generateFreeDeck(req, respond(502, { error: "generation_failed" }))).toEqual({
      kind: "failed",
    });
  });

  it("treats a network error as failed", async () => {
    expect(
      await generateFreeDeck(req, vi.fn().mockRejectedValue(new TypeError("offline")))
    ).toEqual({
      kind: "failed",
    });
  });
});
