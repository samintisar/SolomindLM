const DISPLAY_MATH_PATTERN = /\\\[([\s\S]*?)\\\]/g;
const INLINE_MATH_PATTERN = /\\\(([\s\S]*?)\\\)/g;
const INLINE_CODE_OR_FENCE_PATTERN = /(```[\s\S]*?```|`[^`\n]+`)/g;
const PARENTHESIZED_SEGMENT_PATTERN = /\(([^()\n]{2,240})\)/g;
const LATEX_COMMAND_PATTERN = /\\[A-Za-z]+/;
const SUBSCRIPT_OR_SUPERSCRIPT_PATTERN =
  /(?:^|[^\\])(?:[A-Za-z0-9}\]])[_^](?:\{[^}]+\}|[A-Za-z0-9])/;
const EQUATION_OPERATOR_PATTERN = /[=<>~]/;
const VARIABLE_PATTERN = /\b[A-Za-z](?:_[A-Za-z0-9]+|\^\{?[A-Za-z0-9]+\}?|_[{][^}]+[}]|\d+)?\b/;

function decodeMathEntities(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * LLMs and JSON often emit "\\\\(" instead of "\\(" for LaTeX delimiters. The first pass of
 * {@link normalizeMathDelimiters} only matches "\\(", leaving a stray "\\" before "$...$". Markdown
 * then treats "\\$" as an escaped dollar, so users see raw "$\\gamma$" instead of KaTeX.
 * Repeat until stable so "\\\\\\\\(" collapses to "\\(".
 */
function collapseDoubledTexDelimiterBackslashes(value: string): string {
  let prev = "";
  let out = value;
  while (out !== prev) {
    prev = out;
    out = out
      .replace(/\\\\\(/g, "\\(")
      .replace(/\\\\\)/g, "\\)")
      .replace(/\\\\\[/g, "\\[")
      .replace(/\\\\\]/g, "\\]");
  }
  return out;
}

function trimMathContent(value: string): string {
  return decodeMathEntities(value)
    .trim()
    .replace(/^\$\$?/, "")
    .replace(/\$\$?$/, "")
    .trim();
}

/**
 * Source citations like [1] must stay in markdown text, not inside $...$/$$...$$.
 * Otherwise replaceCitationMarkersOutsideMath skips them and they render as plain digits in KaTeX.
 * Only strips trailing citation markers (LLMs often append them inside parens or \\(...\\)).
 */
const TRAILING_INLINE_CITATION_RE = /(\s*\[\d+\])+(?:\s*)$/;

function extractTrailingCitations(math: string): { core: string; tail: string } {
  const m = math.match(TRAILING_INLINE_CITATION_RE);
  if (!m) {
    return { core: math, tail: "" };
  }
  const tail = m[0];
  const core = math.slice(0, math.length - tail.length).trimEnd();
  if (!core) {
    return { core: math, tail: "" };
  }
  return { core, tail: tail.trimStart() };
}

function isLikelyMathSegment(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || trimmed.includes("$")) {
    return false;
  }

  if (LATEX_COMMAND_PATTERN.test(trimmed) || SUBSCRIPT_OR_SUPERSCRIPT_PATTERN.test(trimmed)) {
    return true;
  }

  return EQUATION_OPERATOR_PATTERN.test(trimmed) && VARIABLE_PATTERN.test(trimmed);
}

function normalizeMathDelimiters(value: string): string {
  return value
    .replace(DISPLAY_MATH_PATTERN, (_, math: string) => {
      const trimmed = trimMathContent(math);
      const { core, tail } = extractTrailingCitations(trimmed);
      if (!tail) {
        return `$$${trimmed}$$`;
      }
      return `$$${core}$$ ${tail}`;
    })
    .replace(INLINE_MATH_PATTERN, (_, math: string) => {
      const trimmed = trimMathContent(math);
      const { core, tail } = extractTrailingCitations(trimmed);
      if (!tail) {
        return `$${trimmed}$`;
      }
      return `$${core}$ ${tail}`;
    });
}

function normalizeMathParentheticals(value: string): string {
  return value.replace(PARENTHESIZED_SEGMENT_PATTERN, (segment, inner: string) => {
    const { core, tail } = extractTrailingCitations(inner);
    const mathPart = tail ? core : inner;
    if (!isLikelyMathSegment(mathPart)) {
      return segment;
    }

    if (tail) {
      return `($${trimMathContent(mathPart)}$) ${tail}`;
    }
    return `($${trimMathContent(inner)}$)`;
  });
}

function normalizeTextSegment(value: string): string {
  const withCanonicalDelimiters = normalizeMathDelimiters(value);
  return normalizeMathParentheticals(withCanonicalDelimiters);
}

export type MathBoundarySegment = { kind: "text"; s: string } | { kind: "math"; s: string };

/**
 * Splits prose into alternating plain-text and math spans ($...$ / $$...$$).
 * Same delimiter rules as `replaceCitationMarkersOutsideMath` in the web app.
 *
 * We must not run `normalizeMathParentheticals` (or delimiter rewrites) **inside**
 * math spans: patterns like `\bigl(Y_{t-i}-\mu\bigr)` live inside `$$...$$`, and the
 * parenthetical regex would wrongly wrap `(Y_{t-i}-\mu\bigr)` as `($...$)`, producing
 * `\bigl($Y_{t-i}-\mu\bigr$)` and breaking KaTeX/remark-math.
 */
/**
 * Index of `needle` at or after `from` that isn't escaped (preceded by an odd run of `\`), or -1.
 * An escaped `\$` is a literal dollar (currency, see {@link escapeCurrencyDollars}), not a delimiter.
 */
export function indexOfUnescaped(text: string, needle: string, from = 0): number {
  let at = text.indexOf(needle, from);
  while (at !== -1) {
    let slashes = 0;
    for (let i = at - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
    if (slashes % 2 === 0) return at;
    at = text.indexOf(needle, at + 1);
  }
  return -1;
}

export function splitByMathDelimiters(value: string): MathBoundarySegment[] {
  const out: MathBoundarySegment[] = [];
  let remaining = value;

  while (remaining.length > 0) {
    const dollarAt = indexOfUnescaped(remaining, "$");
    if (dollarAt === -1) {
      out.push({ kind: "text", s: remaining });
      break;
    }
    if (dollarAt > 0) {
      out.push({ kind: "text", s: remaining.slice(0, dollarAt) });
      remaining = remaining.slice(dollarAt);
    }
    const isDisplay = remaining.startsWith("$$");
    const delim = isDisplay ? "$$" : "$";
    const close = indexOfUnescaped(remaining, delim, delim.length);
    if (close === -1) {
      out.push({ kind: "text", s: remaining });
      break;
    }
    const mathBlock = remaining.slice(0, close + delim.length);
    out.push({ kind: "math", s: mathBlock });
    remaining = remaining.slice(close + delim.length);
  }

  return out;
}

/**
 * Models often wrap fragments in extra `$...$` inside an outer `$$...$$` block (invalid; breaks KaTeX).
 * Strip those inner pairs inside display math only — leave `\\$` (escaped dollar) untouched.
 */
function stripInnerInlineDollarsInDisplayMath(segment: string): string {
  return splitByMathDelimiters(segment)
    .map((part) => {
      if (part.kind !== "math" || !part.s.startsWith("$$") || part.s.length <= 4) {
        return part.s;
      }
      if (!part.s.endsWith("$$")) {
        return part.s;
      }
      const inner = part.s.slice(2, -2);
      const fixed = inner.replace(/(?<![\\])\$([^$\n]+)\$/g, "$1");
      return `$$${fixed}$$`;
    })
    .join("");
}

/**
 * OCR/LLM output often uses e.g. \\begin{array}{cccc} for a 5×n matrix (needs ccccc).
 * KaTeX strict mode warns: "Too few columns specified in the {array} column argument."
 */
function countArrayColumnSpecLetters(spec: string): number {
  const compact = spec.replace(/\s/g, "").replace(/\|/g, "");
  let n = 0;
  for (const ch of compact) {
    if (ch === "c" || ch === "l" || ch === "r") {
      n++;
    }
  }
  return n;
}

function inferMaxColumnsInArrayBody(body: string): number {
  let max = 0;
  const rows = body.split(/\\\\+/);
  for (const row of rows) {
    const t = row.trim();
    if (!t) {
      continue;
    }
    const cells = t.split("&").length;
    max = Math.max(max, cells);
  }
  return max;
}

function findMatchingArrayEnd(tex: string, bodyStart: number): number {
  let depth = 1;
  let pos = bodyStart;
  while (pos < tex.length) {
    const nextBegin = tex.indexOf("\\begin{array}", pos);
    const nextEnd = tex.indexOf("\\end{array}", pos);
    if (nextEnd === -1) {
      return -1;
    }
    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth++;
      pos = nextBegin + 1;
    } else {
      depth--;
      if (depth === 0) {
        return nextEnd;
      }
      pos = nextEnd + "\\end{array}".length;
    }
  }
  return -1;
}

function fixMismatchedArrayEnvironments(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    const j = tex.indexOf("\\begin{array}", i);
    if (j === -1) {
      out += tex.slice(i);
      break;
    }
    out += tex.slice(i, j);
    const m = tex.slice(j).match(/^\\begin\{array\}\{([^}]*)\}/);
    if (!m) {
      out += tex[j];
      i = j + 1;
      continue;
    }
    const spec = m[1];
    const headerLen = m[0].length;
    const bodyStart = j + headerLen;
    const endIdx = findMatchingArrayEnd(tex, bodyStart);
    if (endIdx === -1) {
      out += tex.slice(j, bodyStart);
      i = bodyStart;
      continue;
    }
    const body = tex.slice(bodyStart, endIdx);
    const declared = countArrayColumnSpecLetters(spec);
    const needed = inferMaxColumnsInArrayBody(body);
    if (needed > declared && declared >= 1 && needed <= 32) {
      out += `\\begin{array}{${"c".repeat(needed)}}${body}\\end{array}`;
    } else {
      out += tex.slice(j, endIdx + "\\end{array}".length);
    }
    i = endIdx + "\\end{array}".length;
  }
  return out;
}

function fixArraysInDelimitedMath(mathSpan: string): string {
  if (!mathSpan.startsWith("$")) {
    return mathSpan;
  }
  const isDisplay = mathSpan.startsWith("$$");
  const delim = isDisplay ? "$$" : "$";
  if (mathSpan.length < 2 * delim.length || !mathSpan.endsWith(delim)) {
    return mathSpan;
  }
  const inner = mathSpan.slice(delim.length, -delim.length);
  const decoded = decodeMathEntities(inner);
  return `${delim}${fixMismatchedArrayEnvironments(decoded)}${delim}`;
}

function fixArraysInAllMathSpans(segment: string): string {
  return splitByMathDelimiters(segment)
    .map((part) => (part.kind === "math" ? fixArraysInDelimitedMath(part.s) : part.s))
    .join("");
}

/**
 * LLM/OCR output often includes Unicode spaces KaTeX cannot render (e.g. U+202F narrow no-break space).
 * Strict mode warns: unknownSymbol / missing character metrics. Replace with ASCII space inside math only.
 */
const KATEX_EXOTIC_SPACE_RE = /[\u00A0\u2000-\u200B\u202F\u205F\u2060\uFEFF]/g;

function normalizeExoticSpacesInDelimitedMath(mathSpan: string): string {
  if (!mathSpan.startsWith("$")) {
    return mathSpan;
  }
  const isDisplay = mathSpan.startsWith("$$");
  const delim = isDisplay ? "$$" : "$";
  if (mathSpan.length < 2 * delim.length || !mathSpan.endsWith(delim)) {
    return mathSpan;
  }
  const inner = mathSpan.slice(delim.length, -delim.length);
  const normalized = inner.replace(KATEX_EXOTIC_SPACE_RE, " ");
  return `${delim}${normalized}${delim}`;
}

function normalizeExoticSpacesInAllMathSpans(segment: string): string {
  return splitByMathDelimiters(segment)
    .map((part) => (part.kind === "math" ? normalizeExoticSpacesInDelimitedMath(part.s) : part.s))
    .join("");
}

function normalizeTextOutsideMathOnly(segment: string): string {
  const delimiterFixed = collapseDoubledTexDelimiterBackslashes(segment);
  const arrayFixed = fixArraysInAllMathSpans(delimiterFixed);
  const stripped = stripInnerInlineDollarsInDisplayMath(arrayFixed);
  const delimitersNormalized = splitByMathDelimiters(stripped)
    .map((part) => (part.kind === "text" ? normalizeTextSegment(part.s) : part.s))
    .join("");
  // After \(…\) → $…$ and \[…\] → $$…$$, so newly created math spans are cleaned too.
  return normalizeExoticSpacesInAllMathSpans(delimitersNormalized);
}

export function normalizeMathMarkdown(content: string): string {
  if (!content) {
    return content;
  }

  return content
    .split(INLINE_CODE_OR_FENCE_PATTERN)
    .map((segment) => {
      if (!segment || segment.startsWith("```") || segment.startsWith("`")) {
        return segment;
      }

      return normalizeTextOutsideMathOnly(segment);
    })
    .join("");
}

export function normalizeMathMarkdownDeep<T>(value: T): T {
  if (typeof value === "string") {
    return normalizeMathMarkdown(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMathMarkdownDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, normalizeMathMarkdownDeep(childValue)])
    ) as T;
  }

  return value;
}

// ============================================================
// Currency dollars (#569)
// ============================================================

/** LaTeX markup that only a formula would contain. */
const LATEX_MARKUP = /[\\^_{}]/;
/** Words of two or more letters; two or more of them make a span prose, not `$5 mod 3$`. */
const PROSE_WORDS = /\p{L}{2,}/gu;
/** How an amount can start after its `$`: `$5`, `$.50`, `$ 5`, `$-3`. */
const AMOUNT_START = /^(?:\d|\.\d| \d|-\d)/;
/** What starts a new block after a line break: a blank line, list item, heading, quote or table row. */
const BLOCK_START = /^[ \t]*(?:\n|$|[-*+][ \t]|\d+[.)][ \t]|#|>|\|)/;

/** Index of the `$` closing an inline span opened at `open`, or -1 (none in the same block). */
function findInlineClose(text: string, open: number): number {
  for (let i = open + 1; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
    } else if (char === "\n" && BLOCK_START.test(text.slice(i + 1, i + 41))) {
      return -1;
    } else if (char === "$") {
      return i;
    }
  }
  return -1;
}

function startsAmount(text: string, dollar: number): boolean {
  return AMOUNT_START.test(text.slice(dollar + 1, dollar + 3));
}

/**
 * Whether the span `$…$` from `open` to `close` is currency rather than inline math. Only a `$`
 * that starts an amount can be currency. It's math when the span holds LaTeX markup, or reads as
 * an expression: it doesn't end at another amount, doesn't end in a space (a formula ends at its
 * last symbol: "$110,000, where $x$" is prose), and has fewer than two words (`$17 mod 5 = 2$`).
 */
function isCurrencySpan(text: string, open: number, close: number): boolean {
  if (!startsAmount(text, open)) return false;
  const span = text.slice(open + 1, close);
  if (LATEX_MARKUP.test(span)) return false;
  const endsAtAmount = startsAmount(text, close);
  return endsAtAmount || /\s$/.test(span) || (span.match(PROSE_WORDS)?.length ?? 0) >= 2;
}

function escapeCurrencyInText(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
    } else if (char === "$" && text[i + 1] === "$") {
      // Display math: copied whole.
      const end = text.indexOf("$$", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop);
      i = stop;
    } else if (char === "$") {
      const close = findInlineClose(text, i);
      if (close < 0) {
        // Nothing to pair with in its block. An amount is escaped anyway, so later steps that
        // pair dollars across blocks (splitByMathDelimiters, citation markers) don't either.
        out += startsAmount(text, i) ? "\\$" : char;
        i++;
      } else if (isCurrencySpan(text, i, close)) {
        // Escape only this `$`; the next one is weighed on its own as a possible opener.
        out += "\\$";
        i++;
      } else {
        // Real math: copied whole, so its closing `$` isn't read as an opener.
        out += text.slice(i, close + 1);
        i = close + 1;
      }
    } else {
      out += char;
      i++;
    }
  }
  return out;
}

/**
 * Code where `$` is literal: ``` and ~~~ fences (closed, or still streaming to the end), double-
 * and single-backtick spans, and indented code lines (four spaces or a tab, not a list item).
 */
const CODE_FOR_CURRENCY_PATTERN =
  /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|``[^\n]+?``|`[^`\n]+`|(?:^|\n)(?: {4}|\t)(?![-*+] |\d+[.)] )[^\n]*)/g;

/**
 * Escape dollar signs that are currency, so single-dollar math doesn't read the text between two
 * amounts as a formula ("costs $5 and $10" rendered "5and10" in math type). Real inline math
 * (`$x^2$`, `$0 < \theta < 1$`, `$P > AVC$`, `$5$`, `$17 mod 5 = 2$`), `$$…$$` display math,
 * escaped `\$`, and code are left alone. Runs first in the shared pipeline (sanitizeMarkdown) and
 * again in the renderer; it's idempotent.
 */
export function escapeCurrencyDollars(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  return markdown
    .split(CODE_FOR_CURRENCY_PATTERN)
    .map((part, index) => (index % 2 === 1 ? part : escapeCurrencyInText(part)))
    .join("");
}
