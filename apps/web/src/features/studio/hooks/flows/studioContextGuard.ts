import { AVAILABLE_SMART_MODELS } from "@/shared/constants/models";
import {
  assessStudioContextBudget,
  type ContextBudgetSource,
  TOKENS_PER_WORD,
} from "../../utils/studioContextBudget";
import type { CreateFlowContext } from "./types";

export interface StudioContextWarning {
  title: string;
  message: string;
}

/**
 * Backend env vars (`REPORT_LLM` / `QUIZ_LLM` / …) can override the model per studio type
 * independently, and the client has no way to know which one is actually configured. Assume
 * the smallest catalog window so an override to a smaller-context model doesn't silently
 * make this check too generous.
 */
const CONSERVATIVE_MODEL_ID = AVAILABLE_SMART_MODELS.reduce((smallest, model) =>
  model.contextWindowTokens < smallest.contextWindowTokens ? model : smallest
).id;

function formatApproxWords(tokens: number): string {
  const words = tokens / TOKENS_PER_WORD;
  const step = words >= 10_000 ? 1_000 : 100;
  return (Math.round(words / step) * step).toLocaleString("en-US");
}

/** Warning copy when the selected sources exceed the studio context budget, else null. */
export function getStudioContextWarning(
  sources: ContextBudgetSource[]
): StudioContextWarning | null {
  const assessment = assessStudioContextBudget(sources, CONSERVATIVE_MODEL_ID);
  if (assessment.unknownSizeCount > 0) {
    return {
      title: "Some sources are still processing",
      message:
        `${assessment.unknownSizeCount} selected source${assessment.unknownSizeCount === 1 ? "" : "s"} ` +
        "haven't finished processing yet, so their size can't be checked against the studio context budget. " +
        "For best results, wait for processing to finish before generating, or select fewer sources. " +
        "You can also generate anyway.",
    };
  }
  if (!assessment.exceedsBudget) return null;
  return {
    title: "Large source selection",
    message:
      `Your selected sources add up to about ${formatApproxWords(assessment.estimatedTokens)} words, ` +
      `more than studio generation handles well (about ${formatApproxWords(assessment.budgetTokens)} words). ` +
      "For better results, select fewer, more targeted sources that are relevant to what you want to create. " +
      "You can also generate anyway — it may take longer and cover each source in less depth.",
  };
}

/**
 * Warns before scheduling a studio job whose selected sources exceed the context budget.
 * Resolves true to proceed, false when the user goes back to adjust their selection.
 */
export async function confirmStudioContextBudget(
  ctx: Pick<CreateFlowContext, "confirm"> & { sources: ContextBudgetSource[] }
): Promise<boolean> {
  const warning = getStudioContextWarning(ctx.sources);
  if (!warning || !ctx.confirm) return true;
  return ctx.confirm(warning.title, warning.message, {
    confirmText: "Generate anyway",
    cancelText: "Adjust sources",
    variant: "warning",
  });
}
