/**
 * Source passages for flashcards (#219), so the answer check can judge each card against the
 * text it came from. The map step picks, without an LLM, the sentences of its chunk that share
 * the most words with the card. Collapse and refine rewrite and merge cards, so a card that comes
 * out of them gets the passage of the map card it matches, or of the two it was merged from.
 */

export type PassageCard = { front: string; back: string; sourcePassage?: string };

/** Longest passage kept per card; a merged card can get two. */
export const MAX_PASSAGE_CHARS = 800;

/** Word overlap above which a rewritten card counts as the same card. */
const SAME_CARD_SIMILARITY = 0.5;
/** Word overlap above which a map card counts as one a merged card came from. */
const MERGED_FROM_SIMILARITY = 0.25;

const STOPWORDS = new Set([
  "about",
  "also",
  "because",
  "been",
  "being",
  "does",
  "each",
  "from",
  "have",
  "into",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

/** Content-word stems; any script, so cards in other languages still match their source. */
function stems(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words
      .filter((w) => (w.length >= 4 || /\d/.test(w)) && !STOPWORDS.has(w))
      .map((w) => w.slice(0, 6))
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The sentences of `chunk` that best cover the card: the best-matching sentence, then its
 * neighbours and the next best match while they fit in `maxChars`. Empty when no sentence shares
 * a content word with the card.
 */
export function passageForCard(
  card: PassageCard,
  chunk: string,
  maxChars = MAX_PASSAGE_CHARS
): string {
  const cardStems = stems(`${card.front} ${card.back}`);
  const sentences = splitSentences(chunk);
  const scores = sentences.map((sentence) => {
    let score = 0;
    for (const s of stems(sentence)) if (cardStems.has(s)) score++;
    return score;
  });
  const ranked = scores
    .map((score, index) => ({ score, index }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (ranked.length === 0) return "";

  const chosen = new Set<number>();
  let length = 0;
  const add = (index: number) => {
    if (index < 0 || index >= sentences.length || chosen.has(index)) return;
    const extra = sentences[index].length + 1;
    if (chosen.size > 0 && length + extra > maxChars) return;
    chosen.add(index);
    length += extra;
  };
  const best = ranked[0].index;
  add(best);
  add(best - 1);
  add(best + 1);
  if (ranked[1]) add(ranked[1].index);

  const passage = [...chosen]
    .sort((a, b) => a - b)
    .map((i) => sentences[i])
    .join(" ");
  return passage.length > maxChars ? passage.slice(0, maxChars) : passage;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Gives each card without a passage the passage of the pool card it matches, or, for a card
 * merged from several, the passages of the two pool cards it overlaps most. Cards that match
 * nothing keep no passage and stay unchecked.
 */
export function attachPassages<T extends PassageCard>(cards: T[], pool: PassageCard[]): T[] {
  const sources = pool
    .filter((p) => p.sourcePassage)
    .map((p) => ({ passage: p.sourcePassage as string, stems: stems(`${p.front} ${p.back}`) }));
  if (sources.length === 0) return cards;

  return cards.map((card) => {
    if (card.sourcePassage) return card;
    const cardStems = stems(`${card.front} ${card.back}`);
    const ranked = sources
      .map((s) => ({ passage: s.passage, score: similarity(cardStems, s.stems) }))
      .sort((a, b) => b.score - a.score);
    const [first, second] = ranked;
    if (!first || first.score < MERGED_FROM_SIMILARITY) return card;
    const passages =
      first.score >= SAME_CARD_SIMILARITY ||
      !second ||
      second.score < MERGED_FROM_SIMILARITY ||
      second.passage === first.passage
        ? [first.passage]
        : [first.passage, second.passage];
    return { ...card, sourcePassage: passages.join("\n\n") };
  });
}
