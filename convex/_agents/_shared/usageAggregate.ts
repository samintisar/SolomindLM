export type TokenUsage = { prompt: number; completion: number; total: number };

export function addTokenUsage(a?: TokenUsage, b?: TokenUsage): TokenUsage {
  return {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
}

export function fromProviderUsage(usage?: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}): TokenUsage | undefined {
  if (!usage) return undefined;
  return { prompt: usage.promptTokens, completion: usage.completionTokens, total: usage.totalTokens };
}
