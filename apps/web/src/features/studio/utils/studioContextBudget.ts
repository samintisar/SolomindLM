import { DEFAULT_SMART_MODEL_ID, findSmartModelById } from "@/shared/constants/models";

/**
 * Model studio jobs run their reduce/synthesis phase on. The backend picks it from
 * `REPORT_LLM` / `QUIZ_LLM` / … env vars, which all default to the smart model.
 */
export const STUDIO_GENERATION_MODEL_ID = DEFAULT_SMART_MODEL_ID;

/**
 * Upper bound on source context that still produces focused studio output, even on
 * 1M-token models: past this, map-reduce collapses more aggressively and results thin out.
 */
export const STUDIO_QUALITY_BUDGET_TOKENS = 200_000;

/** Headroom for the system prompt + instructions sent alongside source content. */
const PROMPT_RESERVE_TOKENS = 8_192;
/** Headroom for the generated output. */
const OUTPUT_RESERVE_TOKENS = 16_384;
/** Word/chunk-based estimates undercount dense text (code, CJK, tables). */
const ESTIMATE_SAFETY_FACTOR = 0.8;
/** Used when a model is missing from the catalog. */
const FALLBACK_CONTEXT_WINDOW_TOKENS = 131_072;

/** English averages ~1.3 tokens per word; round up slightly to stay conservative. */
export const TOKENS_PER_WORD = 1.35;
/** Target chunk size used by the ingestion chunker. */
const TOKENS_PER_CHUNK = 1_000;

export interface ContextBudgetSource {
  selected?: boolean;
  wordCount?: number;
  totalChunks?: number;
}

export interface StudioContextBudgetAssessment {
  estimatedTokens: number;
  budgetTokens: number;
  exceedsBudget: boolean;
  /** Selected sources with no size metadata yet (still processing, metadata-only papers). */
  unknownSizeCount: number;
}

/** Estimated tokens a source contributes to studio context, or null when its size is unknown. */
export function estimateSourceTokens(source: ContextBudgetSource): number | null {
  if (source.wordCount && source.wordCount > 0) {
    return Math.ceil(source.wordCount * TOKENS_PER_WORD);
  }
  if (source.totalChunks && source.totalChunks > 0) {
    return source.totalChunks * TOKENS_PER_CHUNK;
  }
  return null;
}

/** Safe source-context budget for a model: its window minus reserves, capped at the quality budget. */
export function getStudioContextBudgetTokens(modelId: string = STUDIO_GENERATION_MODEL_ID): number {
  const contextWindow =
    findSmartModelById(modelId)?.contextWindowTokens ?? FALLBACK_CONTEXT_WINDOW_TOKENS;
  const usable = Math.floor(
    (contextWindow - PROMPT_RESERVE_TOKENS - OUTPUT_RESERVE_TOKENS) * ESTIMATE_SAFETY_FACTOR
  );
  return Math.min(usable, STUDIO_QUALITY_BUDGET_TOKENS);
}

/** Compares the selected sources' estimated size against the model's studio context budget. */
export function assessStudioContextBudget(
  sources: ContextBudgetSource[],
  modelId: string = STUDIO_GENERATION_MODEL_ID
): StudioContextBudgetAssessment {
  let estimatedTokens = 0;
  let unknownSizeCount = 0;
  for (const source of sources) {
    if (!source.selected) continue;
    const tokens = estimateSourceTokens(source);
    if (tokens === null) {
      unknownSizeCount++;
    } else {
      estimatedTokens += tokens;
    }
  }
  const budgetTokens = getStudioContextBudgetTokens(modelId);
  return {
    estimatedTokens,
    budgetTokens,
    exceedsBudget: estimatedTokens > budgetTokens,
    unknownSizeCount,
  };
}
