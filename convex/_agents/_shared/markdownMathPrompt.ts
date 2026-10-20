/**
 * Shared LLM instructions for Markdown math (KaTeX in the web app via Streamdown).
 * Keeps chat and Studio prompts aligned and reduces broken equations from nested `$` or missing delimiters.
 */

export const MARKDOWN_MATH_RULES_BULLETS = `- The expressions below (a, b, x, f, g) are placeholders that only show the formatting. Never copy them into your output; write the math from the sources.
- Inline math: one pair of dollar signs per expression, e.g. $x_i$, $\\alpha$, $f(x)$. **Prefer \\(...\\) for short inline math** (e.g. \\(\\alpha\\), \\(x^{n}\\)) when the expression is simple — it avoids mismatched $...$ pairs. For a given inline expression, use either $...$ or \\(...\\), never both in the same span.
- Display math (equations on its own line): wrap the full equation in exactly one pair of double-dollar delimiters, e.g. $$a = b + c$$. For multi-line display math, keep every line inside the same $$ block.
- **Inside $$ ... $$, use LaTeX only — never put $ inside the block.** Wrong: $$g($x^{n}$) = \\frac{a}{b}$$; right: $$g(x^{n}) = \\frac{a}{b}$$. The renderer treats $ as math boundaries; inner $ breaks KaTeX.
- Do not nest or interleave $...$ regions (invalid examples: g($x$), $$\\alpha + $x$$, or opening $$ then closing with a stray $). The parser uses $ as math boundaries; nesting breaks rendering.
- Every expression that uses backslash-LaTeX (\\sum, \\beta, \\dots, \\tag, etc.), Greek letters, or subscripts/superscripts meant as math must lie entirely inside $...$ or $$...$$; undelimited lines show as broken raw text.
- Use KaTeX-supported LaTeX only (no custom packages or unsupported environments). \\tag{n} on display equations is allowed when needed.
- Place citation markers like [1] in normal text after math or on the following line — never between the opening and closing $ of one inline math span.
- Prefer citations after a closing parenthesis or delimiter, e.g. $(a + b)$ [1], not $(a + b [1])$, so they stay clickable in the app.
- **GFM pipe tables (| col | col |):** Every ASCII | starts a new column, even inside $...$ or $$...$$, which splits formulas and breaks rendering (e.g. $P(a|b)$ becomes two cells). **Never** use a raw | for math vertical bars in table cells. Use LaTeX instead: e.g. $P(a\\mid b)$ or $\\lvert x \\rvert$. For a dense grid of equations, prefer one $$...$$ per line, a bullet list, or a table in HTML; avoid pipe tables when any cell would need |.`;

export const MARKDOWN_MATH_NOTATION_FOR_APP = `**Math notation (Markdown with KaTeX — required for correct rendering in the app):**\n${MARKDOWN_MATH_RULES_BULLETS}`;
