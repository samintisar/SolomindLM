/**
 * Repairs code in written-question text (#573). The shared math rules push the model to wrap
 * identifiers and calls in `$…$` (`train_loop($dataloader, model$)`), which the app renders as
 * math, and multi-line code often comes without a fence, so it renders as prose. This unwraps
 * dollar spans whose content is code, fences runs of code lines, and drops a fenced block that
 * repeats an earlier one. Math (`$x_i$`, `$\alpha$`) and existing code are left alone.
 */

/** Fenced blocks and inline code, which are already code. */
const CODE_SEGMENT = /(```[\s\S]*?```|`[^`\n]*`)/;

/** One `$…$` span on a line (not `$$`). */
const INLINE_DOLLAR_SPAN = /(?<![\\$])\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g;

/**
 * Whether a `$…$` span holds code rather than math: no LaTeX, and a quote, a format field, a
 * multi-letter identifier with an underscore (`loss_fn`, not `x_i`), or a keyword argument.
 */
export function isCodeSpan(content: string): boolean {
  if (/\\[A-Za-z]/.test(content)) return false;
  return (
    /["']/.test(content) ||
    /\{[A-Za-z_]\w*:[^}]*\}/.test(content) ||
    /\b[A-Za-z]{2,}\w*_\w+/.test(content) ||
    /\b[A-Za-z_]{2,}\w*\s*=\s*[-\w"'[(]/.test(content)
  );
}

function unwrapCodeDollars(text: string): string {
  return text.replace(INLINE_DOLLAR_SPAN, (span, content: string) =>
    isCodeSpan(content) ? content : span
  );
}

/** Lines that are code on their own (Python-like and C-like statements). */
const CODE_LINE =
  /^\s*(?:def |class |import |from [\w.]+ import |for .+ in .+:\s*$|while .+:\s*$|if .+:\s*$|elif .+:\s*$|else:\s*$|try:\s*$|except\b.*:\s*$|finally:\s*$|with .+:\s*$|return\b|yield\b|raise\b|print\(|@\w+|[A-Za-z_][\w.[\]'"]*\s*(?:[+\-*/]?=)\s*[^=\s].*$|[A-Za-z_][\w.]*\(.*\)\s*;?\s*$|\/\/\s|[}\])]\s*;?\s*$)/;

/** Prose that starts like an assignment but reads as a sentence ("x = 5 means …"). */
function isProseLine(line: string): boolean {
  return (
    /\s(?:is|are|means|so|because|which|that|the|and|of)\s/i.test(line) && !/[(){}:;]/.test(line)
  );
}

function isCodeLine(line: string, previousWasCode: boolean): boolean {
  if (!line.trim()) return false;
  if (previousWasCode && /^(?: {2,}|\t)\S/.test(line)) return true;
  return CODE_LINE.test(line) && !isProseLine(line);
}

/** Wraps runs of two or more code lines that aren't fenced in a fence. */
function fenceCodeRuns(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push("```", ...run, "```");
    else out.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (isCodeLine(line, run.length > 0)) {
      run.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

function normalizeFence(block: string): string {
  return block
    .replace(/^```\w*\n?/, "")
    .replace(/```$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatCodeInText(text: string): string {
  if (!text) return text;
  const segments = text.split(CODE_SEGMENT);
  const seenFences = new Set<string>();
  return segments
    .map((segment) => {
      if (segment.startsWith("```")) {
        const key = normalizeFence(segment);
        if (key && seenFences.has(key)) return "";
        seenFences.add(key);
        return segment;
      }
      if (segment.startsWith("`")) return segment;
      const unwrapped = unwrapCodeDollars(segment);
      const fenced = fenceCodeRuns(unwrapped);
      for (const block of fenced.match(/```[\s\S]*?```/g) ?? []) {
        seenFences.add(normalizeFence(block));
      }
      return fenced;
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n");
}
