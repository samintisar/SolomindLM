const DISPLAY_MATH_PATTERN = /\\\[([\s\S]*?)\\\]/g;
const INLINE_MATH_PATTERN = /\\\(([\s\S]*?)\\\)/g;
const INLINE_CODE_OR_FENCE_PATTERN = /(```[\s\S]*?```|`[^`\n]+`)/g;
const PARENTHESIZED_SEGMENT_PATTERN = /\(([^()\n]{2,240})\)/g;
const LATEX_COMMAND_PATTERN = /\\[A-Za-z]+/;
const SUBSCRIPT_OR_SUPERSCRIPT_PATTERN = /(?:^|[^\\])(?:[A-Za-z0-9}\]])[_^](?:\{[^}]+\}|[A-Za-z0-9])/;
const EQUATION_OPERATOR_PATTERN = /[=<>~]/;
const VARIABLE_PATTERN = /\b[A-Za-z](?:_[A-Za-z0-9]+|\^\{?[A-Za-z0-9]+\}?|_[{][^}]+[}]|\d+)?\b/;

function decodeMathEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function trimMathContent(value: string): string {
  return decodeMathEntities(value)
    .trim()
    .replace(/^\$\$?/, '')
    .replace(/\$\$?$/, '')
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
    return { core: math, tail: '' };
  }
  const tail = m[0];
  const core = math.slice(0, math.length - tail.length).trimEnd();
  if (!core) {
    return { core: math, tail: '' };
  }
  return { core, tail: tail.trimStart() };
}

function isLikelyMathSegment(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || trimmed.includes('$')) {
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

type MathBoundarySegment =
  | { kind: 'text'; s: string }
  | { kind: 'math'; s: string };

/**
 * Splits prose into alternating plain-text and math spans ($...$ / $$...$$).
 * Same delimiter rules as `replaceCitationMarkersOutsideMath` in the web app.
 *
 * We must not run `normalizeMathParentheticals` (or delimiter rewrites) **inside**
 * math spans: patterns like `\bigl(Y_{t-i}-\mu\bigr)` live inside `$$...$$`, and the
 * parenthetical regex would wrongly wrap `(Y_{t-i}-\mu\bigr)` as `($...$)`, producing
 * `\bigl($Y_{t-i}-\mu\bigr$)` and breaking KaTeX/remark-math.
 */
function splitByMathDelimiters(value: string): MathBoundarySegment[] {
  const out: MathBoundarySegment[] = [];
  let remaining = value;

  while (remaining.length > 0) {
    const dollarAt = remaining.indexOf('$');
    if (dollarAt === -1) {
      out.push({ kind: 'text', s: remaining });
      break;
    }
    if (dollarAt > 0) {
      out.push({ kind: 'text', s: remaining.slice(0, dollarAt) });
      remaining = remaining.slice(dollarAt);
    }
    const isDisplay = remaining.startsWith('$$');
    const delim = isDisplay ? '$$' : '$';
    const close = remaining.indexOf(delim, delim.length);
    if (close === -1) {
      out.push({ kind: 'text', s: remaining });
      break;
    }
    const mathBlock = remaining.slice(0, close + delim.length);
    out.push({ kind: 'math', s: mathBlock });
    remaining = remaining.slice(close + delim.length);
  }

  return out;
}

function normalizeTextOutsideMathOnly(segment: string): string {
  return splitByMathDelimiters(segment)
    .map((part) => (part.kind === 'text' ? normalizeTextSegment(part.s) : part.s))
    .join('');
}

export function normalizeMathMarkdown(content: string): string {
  if (!content) {
    return content;
  }

  return content
    .split(INLINE_CODE_OR_FENCE_PATTERN)
    .map((segment) => {
      if (!segment || segment.startsWith('```') || segment.startsWith('`')) {
        return segment;
      }

      return normalizeTextOutsideMathOnly(segment);
    })
    .join('');
}

export function normalizeMathMarkdownDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return normalizeMathMarkdown(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMathMarkdownDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, normalizeMathMarkdownDeep(childValue)])
    ) as T;
  }

  return value;
}
