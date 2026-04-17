"use node";

import { countTokens } from "../_shared/tokenizer.js";

export type HistoryTurn = { role: string; content: string };

/**
 * Keep the most recent turns whose total estimated tokens stay within maxTokens.
 * Walks backward from the end of `turns` (excludes the current user message if it is not in `turns`).
 */
export function budgetConversationHistory(turns: HistoryTurn[], maxTokens: number): HistoryTurn[] {
  if (maxTokens <= 0 || turns.length === 0) {
    return [];
  }
  let budget = maxTokens;
  const out: HistoryTurn[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const text = `${t.role}\n${t.content}`;
    const cost = countTokens(text);
    if (cost <= budget) {
      out.unshift(t);
      budget -= cost;
    } else {
      break;
    }
  }
  return out;
}
