export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
  /** Prompt tokens the provider served from its prompt cache. Absent when the provider does not report it. */
  cachedPrompt?: number;
};

/** Raw OpenAI-compatible (Together) usage object, including the optional cache breakdown. */
export type TogetherUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
  cached_tokens?: number;
};

export function addTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage {
  const sum: TokenUsage = {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
  if (a?.cachedPrompt !== undefined || b?.cachedPrompt !== undefined) {
    sum.cachedPrompt = (a?.cachedPrompt ?? 0) + (b?.cachedPrompt ?? 0);
  }
  return sum;
}

/** Cached prompt tokens from a raw usage object: `prompt_tokens_details.cached_tokens`, else top-level `cached_tokens`. */
export function readCachedPromptTokens(
  usage: TogetherUsage | null | undefined
): number | undefined {
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens;
  return typeof cached === "number" && cached >= 0 ? cached : undefined;
}

export function fromProviderUsage(usage?: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens?: number;
}): TokenUsage | undefined {
  if (!usage) return undefined;
  const mapped: TokenUsage = {
    prompt: usage.promptTokens,
    completion: usage.completionTokens,
    total: usage.totalTokens,
  };
  if (usage.cachedPromptTokens !== undefined) {
    mapped.cachedPrompt = usage.cachedPromptTokens;
  }
  return mapped;
}

export function fromTogetherUsage(usage?: TogetherUsage | null): TokenUsage | undefined {
  if (!usage) return undefined;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  const total = usage.total_tokens ?? prompt + completion;
  if (total <= 0) return undefined;
  const mapped: TokenUsage = { prompt, completion, total };
  const cachedPrompt = readCachedPromptTokens(usage);
  if (cachedPrompt !== undefined) {
    mapped.cachedPrompt = cachedPrompt;
  }
  return mapped;
}

export type TokenUsageSource = "provider" | "estimated";

export function resolveEvalTokenUsage(input: { provider?: TokenUsage; estimated: TokenUsage }): {
  tokenUsage: TokenUsage;
  tokenUsageSource: TokenUsageSource;
} {
  if (input.provider !== undefined && input.provider.total > 0) {
    return { tokenUsage: input.provider, tokenUsageSource: "provider" };
  }
  return { tokenUsage: input.estimated, tokenUsageSource: "estimated" };
}
