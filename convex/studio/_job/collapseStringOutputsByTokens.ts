"use node";

/**
 * Groups string outputs so each group's estimated token count stays under `maxTokens`.
 * Used by audio overview map-result collapse (not the flashcard LLM `recursiveCollapse`, which operates on card arrays).
 */

import { countTokens } from "../../_agents/_shared/index";

export function collapseStringOutputsByTokens(outputs: string[], maxTokens: number): string[] {
  if (outputs.length <= 3) {
    return outputs;
  }

  const totalTokens = outputs.reduce((sum, s) => sum + countTokens(s), 0);

  if (totalTokens <= maxTokens) {
    return outputs;
  }

  const collapsed: string[] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of outputs) {
    const tokens = countTokens(output);
    if (currentTokens + tokens > maxTokens && currentGroup.length > 0) {
      collapsed.push(currentGroup.join("\n\n---\n\n"));
      currentGroup = [output];
      currentTokens = tokens;
    } else {
      currentGroup.push(output);
      currentTokens += tokens;
    }
  }

  if (currentGroup.length > 0) {
    collapsed.push(currentGroup.join("\n\n---\n\n"));
  }

  return collapsed;
}
