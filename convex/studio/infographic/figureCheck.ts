/**
 * Checks the figures an infographic design wants to draw against the source text, and keeps
 * unchecked numbers out of the image prompt (#572). The design step lists every figure it uses
 * (value, label, period); a figure is kept only when its number appears in the sources with the
 * label's words and the period's years nearby. The image prompt then loses every sentence with a
 * number that isn't a kept figure, and gets the kept figures appended as the only ones to show.
 */

export interface InfographicFigure {
  value: string;
  label: string;
  period?: string;
}

export interface DroppedFigure {
  figure: InfographicFigure;
  reason: "number_not_in_sources" | "label_not_near_number" | "period_not_near_number";
}

interface NumberMention {
  value: number;
  /** Significant digits as written, for matching a rounded figure ("$104K" vs 104,350). */
  digits: number;
  isYear: boolean;
  /** -1 for "-4%" or "−4%", 1 for "+4%", 0 when the number has no sign. */
  sign: -1 | 0 | 1;
  index: number;
  end: number;
}

/** Characters around a number in the source in which its label and period must appear. */
const CONTEXT_CHARS = 200;

/** Bare whole numbers up to this are allowed in the image prompt: list numbering, item counts. */
const MAX_BARE_COUNT = 12;

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  trillion: 1e12,
};

const NUMBER_RE =
  /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(thousand|million|billion|trillion)\b|(k|m|bn|b)\b)?/gi;

/** Dimensions and ratios ("1536x1024", "16:9") are layout, not figures. */
const LAYOUT_RE = /\d+\s*[x×:]\s*\d+/gi;

const STOPWORDS = new Set([
  "about",
  "across",
  "after",
  "also",
  "average",
  "between",
  "from",
  "into",
  "more",
  "over",
  "since",
  "than",
  "that",
  "their",
  "there",
  "this",
  "through",
  "total",
  "under",
  "with",
  "year",
  "years",
]);

function significantDigits(integer: string, fraction: string | undefined): number {
  const digits = `${integer.replace(/,/g, "")}${fraction ?? ""}`.replace(/^0+/, "");
  const trimmed = fraction ? digits : digits.replace(/0+$/, "");
  return Math.max(1, trimmed.length);
}

export function findNumbers(text: string): NumberMention[] {
  const layout = [...text.matchAll(LAYOUT_RE)].map((m) => [m.index, m.index + m[0].length]);
  const mentions: NumberMention[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const index = m.index;
    if (layout.some(([start, end]) => index >= start && index < end)) continue;
    const [, integer, fraction, word, letter] = m;
    const scale = SCALE[(word ?? letter ?? "").toLowerCase()] ?? 1;
    const value = Number(`${integer.replace(/,/g, "")}${fraction ? `.${fraction}` : ""}`) * scale;
    const isYear =
      scale === 1 && !fraction && !integer.includes(",") && value >= 1900 && value <= 2100;
    // A sign right before the number, with no word or digit before it ("2016-2025" is a range).
    const before = text.slice(Math.max(0, index - 2), index);
    const sign = /(?:^|[^\w])[-−]$/.test(before) ? -1 : /(?:^|[^\w])\+$/.test(before) ? 1 : 0;
    mentions.push({
      value,
      digits: significantDigits(integer, fraction),
      isYear,
      sign,
      index,
      end: index + m[0].length,
    });
  }
  return mentions;
}

/** Words that make an unsigned source number a fall ("fell 4%", "a 4% decline"). */
const DECLINE_WORDS =
  /\b(?:fell|fall|falls|fallen|declin\w*|decreas\w*|drop\w*|down|lower|loss|losses|shrank|shrink\w*|reduc\w*|negative)\b/i;

/**
 * Whether a figure's sign agrees with the source: "-4%" needs a negative or falling number in the
 * source, and "+4%" must not match one. A figure without a sign matches either.
 */
function sameDirection(written: NumberMention, source: NumberMention, text: string): boolean {
  if (written.sign === 0) return true;
  // The words just around the number: wider, it picks up a neighbouring figure's verb.
  const nearby = text.slice(Math.max(0, source.index - 25), source.end + 15);
  const falling = source.sign === -1 || (source.sign === 0 && DECLINE_WORDS.test(nearby));
  return written.sign === -1 ? falling : !falling;
}

function roundTo(value: number, digits: number): number {
  if (value === 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1);
  return Math.round(value / magnitude) * magnitude;
}

/** Whether `written` (as shown) is `actual`, exactly or rounded to the digits it is written with. */
function sameNumber(written: NumberMention, actual: number): boolean {
  const tolerance = Math.abs(actual) * 1e-9 + 1e-9;
  return (
    Math.abs(written.value - actual) <= tolerance ||
    Math.abs(written.value - roundTo(actual, written.digits)) <= Math.abs(written.value) * 1e-9
  );
}

function stem(word: string): string {
  return word.slice(0, 5);
}

function contentStems(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.has(w)).map(stem))];
}

function labelNearby(label: string, context: string): boolean {
  const wanted = contentStems(label);
  if (wanted.length === 0) return true;
  const present = new Set(contentStems(context));
  const found = wanted.filter((w) => present.has(w)).length;
  return found >= Math.ceil(wanted.length / 2);
}

function periodNearby(period: string | undefined, context: string): boolean {
  const years = findNumbers(period ?? "").filter((n) => n.isYear);
  if (years.length === 0) return true;
  const contextYears = new Set(findNumbers(context).map((n) => n.value));
  return years.every((y) => contextYears.has(y.value));
}

/**
 * Keeps the figures whose number appears in the sources with its label (at least half of its
 * content words) and its period's years within `CONTEXT_CHARS` of that number.
 */
export function verifyFigures(
  figures: InfographicFigure[],
  sourceText: string
): { kept: InfographicFigure[]; dropped: DroppedFigure[] } {
  const sourceNumbers = findNumbers(sourceText).filter((n) => !n.isYear);
  const kept: InfographicFigure[] = [];
  const dropped: DroppedFigure[] = [];

  for (const figure of figures) {
    const values = findNumbers(figure.value).filter((n) => !n.isYear);
    if (values.length === 0) {
      dropped.push({ figure, reason: "number_not_in_sources" });
      continue;
    }
    let reason: DroppedFigure["reason"] | null = null;
    for (const written of values) {
      const contexts = sourceNumbers
        .filter((n) => sameNumber(written, n.value) && sameDirection(written, n, sourceText))
        .map((n) => sourceText.slice(Math.max(0, n.index - CONTEXT_CHARS), n.end + CONTEXT_CHARS));
      if (contexts.length === 0) {
        reason = "number_not_in_sources";
        break;
      }
      const labelled = contexts.filter((c) => labelNearby(figure.label, c));
      if (labelled.length === 0) {
        reason = "label_not_near_number";
        break;
      }
      if (!labelled.some((c) => periodNearby(figure.period, c))) {
        reason = "period_not_near_number";
        break;
      }
    }
    if (reason) dropped.push({ figure, reason });
    else kept.push(figure);
  }
  return { kept, dropped };
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim().length > 0);
}

/**
 * Removes every sentence of the image prompt with a number that isn't one of the kept figures, one
 * of their periods' years, a layout size, or a small count, then lists the kept figures as the only
 * ones to show.
 */
export function buildCheckedImagePrompt(
  imagePrompt: string,
  kept: InfographicFigure[]
): { prompt: string; removedSentences: string[] } {
  const figureNumbers = kept.flatMap((f) => findNumbers(f.value).filter((n) => !n.isYear));
  const years = new Set(
    kept.flatMap((f) => findNumbers(f.period ?? "").filter((n) => n.isYear)).map((n) => n.value)
  );
  const allowed = (n: NumberMention) =>
    (n.isYear && years.has(n.value)) ||
    (!n.isYear && Number.isInteger(n.value) && n.value <= MAX_BARE_COUNT) ||
    figureNumbers.some((f) => sameNumber(n, f.value) || sameNumber(f, n.value));

  const removedSentences: string[] = [];
  const keptSentences = splitSentences(imagePrompt).filter((sentence) => {
    const ok = findNumbers(sentence).every(allowed);
    if (!ok) removedSentences.push(sentence);
    return ok;
  });

  const figureList =
    kept.length > 0
      ? `Show only these figures, exactly as written, each with its label and period. Show no other numbers:\n${kept
          .map((f) => `- ${f.value}: ${f.label}${f.period?.trim() ? ` (${f.period.trim()})` : ""}`)
          .join("\n")}`
      : "Show no numbers, statistics or dates.";

  return { prompt: `${keptSentences.join(" ")}\n\n${figureList}`, removedSentences };
}

/** Reads the design's `figures` list, skipping malformed entries. */
export function parseDesignFigures(raw: unknown): InfographicFigure[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { value, label, period } = item as Record<string, unknown>;
    if (typeof value !== "string" || !value.trim()) return [];
    return [
      {
        value: value.trim(),
        label: typeof label === "string" ? label.trim() : "",
        ...(typeof period === "string" && period.trim() ? { period: period.trim() } : {}),
      },
    ];
  });
}
