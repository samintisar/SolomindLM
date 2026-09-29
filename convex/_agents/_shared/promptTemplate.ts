/**
 * Replaces every `{key}` placeholder in one pass. Values are inserted verbatim: a function
 * replacer keeps `$&`-style patterns in source text literal, and placeholder-like text inside
 * inserted values is never re-substituted. Unknown `{…}` tokens (e.g. LaTeX `\frac{m}{d}`) are
 * left untouched.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match
  );
}
