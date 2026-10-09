/** A run of rendered text and the handle (a DOM Text node in the app) it came from. */
export interface TextSegment<N> {
  node: N;
  text: string;
}

interface PassagePoint<N> {
  node: N;
  offset: number;
}

export interface PassageRange<N> {
  start: PassagePoint<N>;
  end: PassagePoint<N>;
}

interface Word<N> {
  word: string;
  node: N;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Words matched at each end of the quote. Long enough to be unique in a page, short enough to dodge formatting. */
const ANCHOR_WORDS = 6;

function wordsOf<N>(segments: readonly TextSegment<N>[]): Word<N>[] {
  const words: Word<N>[] = [];
  for (const { node, text } of segments) {
    for (const m of text.matchAll(WORD)) {
      const start = m.index ?? 0;
      words.push({ word: m[0].toLowerCase(), node, start, end: start + m[0].length });
    }
  }
  return words;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * The quote's words as a reader sees them: images, maths (rendered apart from the prose), link targets and
 * HTML tags dropped, common entities decoded.
 */
function quoteWords(quote: string): string[] {
  const visible = quote
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$(?=\S)[^$\n]+?(?<=\S)\$/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
  return Array.from(visible.matchAll(WORD), (m) => m[0].toLowerCase());
}

function runMatchesAt<N>(words: Word<N>[], run: string[], at: number): boolean {
  return run.every((word, j) => words[at + j].word === word);
}

function indexOfRun<N>(words: Word<N>[], run: string[], from: number, until: number): number {
  const last = Math.min(words.length, until) - run.length;
  for (let i = from; i <= last; i++) {
    if (runMatchesAt(words, run, i)) return i;
  }
  return -1;
}

/**
 * Locates `quote` (raw markdown from a chunk) in rendered text. Anchors on a window of the quote's words —
 * the opening six, then each next six, then the closing six, since a quote can open with maths or a link that
 * renders differently — and ends on the quote's last six words. When the ending can't be found it covers the
 * quote's word count from the start. Returns null when no window is found.
 */
export function findPassageRange<N>(
  segments: readonly TextSegment<N>[],
  quote: string
): PassageRange<N> | null {
  const words = wordsOf(segments);
  const q = quoteWords(quote);
  if (q.length === 0 || words.length === 0) return null;

  const k = Math.min(ANCHOR_WORDS, q.length);
  const windowOffsets: number[] = [];
  for (let offset = 0; offset + k <= q.length; offset += k) windowOffsets.push(offset);
  if (windowOffsets[windowOffsets.length - 1] !== q.length - k) windowOffsets.push(q.length - k);

  // Each window, each place it occurs. An occurrence is confirmed when the quote's ending follows it; of
  // those, the one with the ending nearest wins, so a repeated header or footer ahead of the passage
  // (whose ending is also within reach) can't claim the start.
  let fallback: { startIdx: number; remaining: number } | null = null;
  let confirmed: { startIdx: number; endIdx: number; span: number } | null = null;
  for (const offset of windowOffsets) {
    const window = q.slice(offset, offset + k);
    const remaining = q.length - offset;
    for (
      let at = indexOfRun(words, window, 0, words.length);
      at !== -1;
      at = indexOfRun(words, window, at + 1, words.length)
    ) {
      fallback ??= { startIdx: at, remaining };
      const endRun = indexOfRun(words, q.slice(q.length - k), at, at + remaining * 2 + k);
      if (endRun !== -1 && (!confirmed || endRun - at < confirmed.span)) {
        confirmed = { startIdx: at, endIdx: endRun + k - 1, span: endRun - at };
      }
    }
    if (confirmed) break;
  }

  let startIdx: number;
  let endIdx: number;
  if (confirmed) {
    ({ startIdx, endIdx } = confirmed);
  } else if (fallback) {
    startIdx = fallback.startIdx;
    endIdx = Math.min(startIdx + fallback.remaining - 1, words.length - 1);
  } else {
    return null;
  }

  const first = words[startIdx];
  const last = words[endIdx];
  return {
    start: { node: first.node, offset: first.start },
    end: { node: last.node, offset: last.end },
  };
}
