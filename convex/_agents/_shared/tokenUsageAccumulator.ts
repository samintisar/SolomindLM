import { addTokenUsage, type TokenUsage } from "./usageAggregate";

export function createTokenUsageAccumulator() {
  let current: TokenUsage | undefined;

  return {
    add(usage?: TokenUsage) {
      if (usage === undefined || usage.total <= 0) {
        return;
      }
      current = addTokenUsage(current, usage);
    },
    consume(): TokenUsage | undefined {
      const usage = current;
      current = undefined;
      if (usage === undefined || usage.total <= 0) {
        return undefined;
      }
      return usage;
    },
  };
}

export type TokenUsageAccumulator = ReturnType<typeof createTokenUsageAccumulator>;
