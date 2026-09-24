/**
 * Grouping plan for the spreadsheet collapse phase (pure; no LLM calls).
 * @see ./spreadsheetJobPhases.ts `recursiveCollapse`
 */

type EstimateTokens = (text: string) => number;

/** True once the outputs are few or small enough to hand straight to the reduce step. */
export function shouldStopCollapsing(
  outputs: string[],
  targetTokens: number,
  estimateTokens: EstimateTokens
): boolean {
  if (outputs.length <= 2) {
    return true;
  }
  const totalTokens = outputs.reduce((sum, text) => sum + estimateTokens(text), 0);
  return totalTokens <= targetTokens;
}

/**
 * Packs outputs into groups of roughly `targetTokens` each, preserving order.
 *
 * Every group holds at least two outputs (when there are two or more), so each
 * collapse round at least halves the output count even if the LLM does not
 * shrink the text at all. Without that guarantee, outputs each larger than half
 * the target end up in singleton groups and the collapse never converges.
 */
export function planCollapseGroups(
  outputs: string[],
  targetTokens: number,
  estimateTokens: EstimateTokens
): string[][] {
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of outputs) {
    const outputTokens = estimateTokens(output);

    if (currentTokens + outputTokens > targetTokens && currentGroup.length >= 2) {
      groups.push(currentGroup);
      currentGroup = [output];
      currentTokens = outputTokens;
    } else {
      currentGroup.push(output);
      currentTokens += outputTokens;
    }
  }

  if (currentGroup.length === 1 && groups.length > 0) {
    groups[groups.length - 1].push(currentGroup[0]);
  } else if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}
