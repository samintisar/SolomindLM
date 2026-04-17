import { replaceCitationMarkersWithPlaceholders } from "@convex/_agents/_shared/citationExtract";

/**
 * Replaces citation markers [1], [2], etc. (also \[1\] when models escape brackets) with `CITE:n`
 * only in non-math segments. Avoids corrupting LaTeX (e.g. matrix [1, 0]) inside $...$ or $$...$$.
 */
export function replaceCitationMarkersOutsideMath(content: string): string {
  const parts: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    // Prefer $$ over $ so we don't split display math
    const nextDollar = remaining.indexOf("$");
    if (nextDollar === -1) {
      parts.push(replaceCitationMarkersWithPlaceholders(remaining));
      break;
    }

    const isDisplayMath = remaining.slice(nextDollar, nextDollar + 2) === "$$";
    const delim = isDisplayMath ? "$$" : "$";
    const afterOpen = nextDollar + delim.length;
    const closeIndex = remaining.indexOf(delim, afterOpen);

    if (closeIndex === -1) {
      // Unclosed delimiter: treat rest as text and replace citations
      parts.push(replaceCitationMarkersWithPlaceholders(remaining));
      break;
    }

    const textSegment = remaining.slice(0, nextDollar);
    const mathSegment = remaining.slice(nextDollar, closeIndex + delim.length);

    parts.push(replaceCitationMarkersWithPlaceholders(textSegment));
    parts.push(mathSegment);
    remaining = remaining.slice(closeIndex + delim.length);
  }

  return parts.join("");
}
