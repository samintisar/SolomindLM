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
    .replace(DISPLAY_MATH_PATTERN, (_, math: string) => `$$${trimMathContent(math)}$$`)
    .replace(INLINE_MATH_PATTERN, (_, math: string) => `$${trimMathContent(math)}$`);
}

function normalizeMathParentheticals(value: string): string {
  return value.replace(PARENTHESIZED_SEGMENT_PATTERN, (segment, inner: string) => {
    if (!isLikelyMathSegment(inner)) {
      return segment;
    }

    return `($${trimMathContent(inner)}$)`;
  });
}

function normalizeTextSegment(value: string): string {
  const withCanonicalDelimiters = normalizeMathDelimiters(value);
  return normalizeMathParentheticals(withCanonicalDelimiters);
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

      return normalizeTextSegment(segment);
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
