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

export type MathBoundarySegment =
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
export function splitByMathDelimiters(value: string): MathBoundarySegment[] {
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

/**
 * Models often wrap fragments in extra `$...$` inside an outer `$$...$$` block (invalid; breaks KaTeX).
 * Strip those inner pairs inside display math only — leave `\\$` (escaped dollar) untouched.
 */
function stripInnerInlineDollarsInDisplayMath(segment: string): string {
  return splitByMathDelimiters(segment)
    .map((part) => {
      if (part.kind !== 'math' || !part.s.startsWith('$$') || part.s.length <= 4) {
        return part.s;
      }
      if (!part.s.endsWith('$$')) {
        return part.s;
      }
      const inner = part.s.slice(2, -2);
      const fixed = inner.replace(/(?<![\\])\$([^$\n]+)\$/g, '$1');
      return `$$${fixed}$$`;
    })
    .join('');
}

/**
 * OCR/LLM output often uses e.g. \\begin{array}{cccc} for a 5×n matrix (needs ccccc).
 * KaTeX strict mode warns: "Too few columns specified in the {array} column argument."
 */
function countArrayColumnSpecLetters(spec: string): number {
  const compact = spec.replace(/\s/g, '').replace(/\|/g, '');
  let n = 0;
  for (const ch of compact) {
    if (ch === 'c' || ch === 'l' || ch === 'r') {
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
    const cells = t.split('&').length;
    max = Math.max(max, cells);
  }
  return max;
}

function findMatchingArrayEnd(tex: string, bodyStart: number): number {
  let depth = 1;
  let pos = bodyStart;
  while (pos < tex.length) {
    const nextBegin = tex.indexOf('\\begin{array}', pos);
    const nextEnd = tex.indexOf('\\end{array}', pos);
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
      pos = nextEnd + '\\end{array}'.length;
    }
  }
  return -1;
}

function fixMismatchedArrayEnvironments(tex: string): string {
  let out = '';
  let i = 0;
  while (i < tex.length) {
    const j = tex.indexOf('\\begin{array}', i);
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
      out += `\\begin{array}{${'c'.repeat(needed)}}${body}\\end{array}`;
    } else {
      out += tex.slice(j, endIdx + '\\end{array}'.length);
    }
    i = endIdx + '\\end{array}'.length;
  }
  return out;
}

function fixArraysInDelimitedMath(mathSpan: string): string {
  if (!mathSpan.startsWith('$')) {
    return mathSpan;
  }
  const isDisplay = mathSpan.startsWith('$$');
  const delim = isDisplay ? '$$' : '$';
  if (mathSpan.length < 2 * delim.length || !mathSpan.endsWith(delim)) {
    return mathSpan;
  }
  const inner = mathSpan.slice(delim.length, -delim.length);
  const decoded = decodeMathEntities(inner);
  return `${delim}${fixMismatchedArrayEnvironments(decoded)}${delim}`;
}

function fixArraysInAllMathSpans(segment: string): string {
  return splitByMathDelimiters(segment)
    .map((part) => (part.kind === 'math' ? fixArraysInDelimitedMath(part.s) : part.s))
    .join('');
}

function normalizeTextOutsideMathOnly(segment: string): string {
  const arrayFixed = fixArraysInAllMathSpans(segment);
  const stripped = stripInnerInlineDollarsInDisplayMath(arrayFixed);
  return splitByMathDelimiters(stripped)
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
