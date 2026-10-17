/**
 * Chat knobs an eval run may override, and the resolved config a ChatAgent works from.
 *
 * Every field defaults to the production constant it names, so an agent built without overrides
 * behaves exactly as before. Production never passes overrides; the eval action does, from the
 * `--chat-config` flag.
 */

import { type Infer, v } from "convex/values";
import { InputValidationError } from "../../_lib/errors";
import {
  CONTEXT_TOKEN_BUDGET,
  LIST_QUERY_CONTEXT_TOKEN_BUDGET,
  MAX_RETRIEVAL_SUBQUERIES,
  MULTI_SOURCE_MAX_EXTRA_TOKENS,
  NEIGHBOUR_PASSAGE_TOKEN_BUDGET,
  OPENING_PASSAGE_TOKEN_BUDGET,
} from "./chatConfig";
import { DEFAULT_KEYWORD_VARIANTS } from "./queryExpansion";

/** Convex validator for the override arguments; every field is optional. */
export const chatConfigOverridesValidator = v.object({
  contextTokenBudget: v.optional(v.number()),
  listQueryContextTokenBudget: v.optional(v.number()),
  neighbourPassageTokenBudget: v.optional(v.number()),
  openingPassageTokenBudget: v.optional(v.number()),
  multiSourceMaxExtraTokens: v.optional(v.number()),
  hydeEnabled: v.optional(v.boolean()),
  maxSubqueries: v.optional(v.number()),
  keywordVariants: v.optional(v.number()),
  /** "on" (no cap), "off" (never expand), or a token cap a whole document must fit under. */
  fullDocumentExpansion: v.optional(v.union(v.literal("on"), v.literal("off"), v.number())),
  fewShotPolicy: v.optional(
    v.union(
      v.literal("always"),
      v.literal("complex-only"),
      v.literal("never"),
      v.literal("history-or-complex")
    )
  ),
  rerankEnabled: v.optional(v.boolean()),
});

export type ChatConfigOverrides = Infer<typeof chatConfigOverridesValidator>;

/** The override names, for CLI parsing and the validator check. */
export const CHAT_CONFIG_OVERRIDE_KEYS = [
  "contextTokenBudget",
  "listQueryContextTokenBudget",
  "neighbourPassageTokenBudget",
  "openingPassageTokenBudget",
  "multiSourceMaxExtraTokens",
  "hydeEnabled",
  "maxSubqueries",
  "keywordVariants",
  "fullDocumentExpansion",
  "fewShotPolicy",
  "rerankEnabled",
] as const satisfies ReadonlyArray<keyof ChatConfigOverrides>;

export type ChatConfigOverrideKey = (typeof CHAT_CONFIG_OVERRIDE_KEYS)[number];

export type FewShotPolicy = NonNullable<ChatConfigOverrides["fewShotPolicy"]>;

export interface ResolvedChatConfig {
  contextTokenBudget: number;
  listQueryContextTokenBudget: number;
  neighbourPassageTokenBudget: number;
  openingPassageTokenBudget: number;
  multiSourceMaxExtraTokens: number;
  hydeEnabled: boolean;
  maxSubqueries: number;
  keywordVariants: number;
  fullDocumentExpansion: "on" | "off" | number;
  /**
   * "history-or-complex" is production: few-shot examples when there is no history or the query
   * is complex. "complex-only" and "always" change only that trigger; "never" drops the block.
   */
  fewShotPolicy: FewShotPolicy;
  rerankEnabled: boolean;
}

const MAX_KEYWORD_VARIANTS = 2;

/** Production values: each field is the constant or env value it names. */
export const PRODUCTION_CHAT_CONFIG: Readonly<ResolvedChatConfig> = {
  contextTokenBudget: CONTEXT_TOKEN_BUDGET,
  listQueryContextTokenBudget: LIST_QUERY_CONTEXT_TOKEN_BUDGET,
  neighbourPassageTokenBudget: NEIGHBOUR_PASSAGE_TOKEN_BUDGET,
  openingPassageTokenBudget: OPENING_PASSAGE_TOKEN_BUDGET,
  multiSourceMaxExtraTokens: MULTI_SOURCE_MAX_EXTRA_TOKENS,
  hydeEnabled: true,
  maxSubqueries: MAX_RETRIEVAL_SUBQUERIES,
  keywordVariants: DEFAULT_KEYWORD_VARIANTS,
  fullDocumentExpansion: "on",
  fewShotPolicy: "history-or-complex",
  rerankEnabled: true,
};

/** Problems with the override values (ranges only; types are checked by the validator). */
export function validateChatConfigOverrides(overrides: ChatConfigOverrides): string[] {
  const problems: string[] = [];
  const integerAtLeast = (key: string, value: number | undefined, min: number) => {
    if (value !== undefined && !(Number.isInteger(value) && value >= min)) {
      problems.push(`${key} must be an integer >= ${min} (got ${value})`);
    }
  };
  integerAtLeast("contextTokenBudget", overrides.contextTokenBudget, 1);
  integerAtLeast("listQueryContextTokenBudget", overrides.listQueryContextTokenBudget, 1);
  integerAtLeast("neighbourPassageTokenBudget", overrides.neighbourPassageTokenBudget, 0);
  integerAtLeast("openingPassageTokenBudget", overrides.openingPassageTokenBudget, 0);
  integerAtLeast("multiSourceMaxExtraTokens", overrides.multiSourceMaxExtraTokens, 0);
  if (overrides.maxSubqueries !== undefined) {
    const n = overrides.maxSubqueries;
    if (!Number.isInteger(n) || n < 1 || n > MAX_RETRIEVAL_SUBQUERIES) {
      problems.push(
        `maxSubqueries must be an integer from 1 to ${MAX_RETRIEVAL_SUBQUERIES} (got ${n})`
      );
    }
  }
  if (overrides.keywordVariants !== undefined) {
    const n = overrides.keywordVariants;
    if (!Number.isInteger(n) || n < 0 || n > MAX_KEYWORD_VARIANTS) {
      problems.push(
        `keywordVariants must be an integer from 0 to ${MAX_KEYWORD_VARIANTS} (got ${n})`
      );
    }
  }
  const expansion = overrides.fullDocumentExpansion;
  if (typeof expansion === "number") {
    integerAtLeast("fullDocumentExpansion", expansion, 1);
  }
  return problems;
}

/** Defined overrides on top of the production values. Throws when a value is out of range. */
export function resolveChatConfig(overrides?: ChatConfigOverrides): ResolvedChatConfig {
  const given = overrides ?? {};
  const problems = validateChatConfigOverrides(given);
  if (problems.length > 0) {
    throw new InputValidationError(`Invalid chat config override: ${problems.join("; ")}`);
  }
  const defined = Object.fromEntries(
    Object.entries(given).filter(([, value]) => value !== undefined)
  );
  return { ...PRODUCTION_CHAT_CONFIG, ...defined };
}
