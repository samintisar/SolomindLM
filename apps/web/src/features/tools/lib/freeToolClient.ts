import type { FreeFlashcardCardCount } from "@convex/_lib/freeToolBounds";
import type { Flashcard } from "@/shared/types/index";

// HTTP actions live on the .site host. Kept local (not chatStream.ts) so this page's chunk
// doesn't pull in the chat module.
const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL ||
  import.meta.env.VITE_CONVEX_URL?.replace(".cloud", ".site");

const FREE_FLASHCARDS_URL = `${CONVEX_SITE_URL ?? ""}/tools/flashcards`;

export type FreeDeckCard = Pick<Flashcard, "type" | "front" | "back" | "topic">;
export type FreeDeck = { title: string; cards: FreeDeckCard[] };

export type GenerateFreeDeckResult =
  | { kind: "ok"; deck: FreeDeck }
  | { kind: "invalid"; error: string }
  | { kind: "captcha" }
  | { kind: "limited"; scope: "ip" | "global"; retryAfterMs: number }
  | { kind: "failed" };

type WireCard = Omit<FreeDeckCard, "topic"> & { topic?: string | null };

export async function generateFreeDeck(
  request: { text: string; cardCount: FreeFlashcardCardCount; turnstileToken: string },
  fetchImpl: typeof fetch = fetch
): Promise<GenerateFreeDeckResult> {
  let response: Response;
  try {
    response = await fetchImpl(FREE_FLASHCARDS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { kind: "failed" };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 200) {
    if (!Array.isArray(body.cards)) return { kind: "failed" };
    const cards = (body.cards as WireCard[]).map(({ topic, ...card }) =>
      topic ? { ...card, topic } : card
    );
    const title = typeof body.title === "string" && body.title.trim() ? body.title : "Flashcards";
    return { kind: "ok", deck: { title, cards } };
  }
  if (response.status === 400 || response.status === 413) {
    return { kind: "invalid", error: String(body.error ?? "invalid_body") };
  }
  if (response.status === 403) return { kind: "captcha" };
  if (response.status === 429) {
    return {
      kind: "limited",
      scope: body.scope === "global" ? "global" : "ip",
      retryAfterMs: Number(body.retryAfterMs ?? 0),
    };
  }
  return { kind: "failed" };
}
