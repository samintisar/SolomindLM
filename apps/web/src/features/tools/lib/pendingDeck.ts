import type { FreeDeckCard } from "./freeToolClient";

/** A free-tool deck waiting for sign-in, so it can be saved into a notebook afterwards. */
const KEY = "solomind.freeTool.pendingDeck";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingDeck = {
  title: string;
  sourceText: string;
  cards: FreeDeckCard[];
  savedAt: number;
};

export function savePendingDeck(deck: Omit<PendingDeck, "savedAt">, now = Date.now()): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...deck, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function readPendingDeck(now = Date.now()): PendingDeck | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const deck = JSON.parse(raw) as PendingDeck;
    const valid =
      typeof deck.title === "string" &&
      typeof deck.sourceText === "string" &&
      Array.isArray(deck.cards) &&
      typeof deck.savedAt === "number";
    if (!valid || now - deck.savedAt > MAX_AGE_MS) return null;
    return deck;
  } catch {
    return null;
  }
}

export function clearPendingDeck(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}
