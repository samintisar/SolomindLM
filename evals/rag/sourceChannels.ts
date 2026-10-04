/**
 * Source channels the eval harness can request, validated at the boundaries
 * where they arrive as plain strings (CLI flags, server echoes).
 */
import type { EvalSourceChannel, SourcePolicyConfig } from "./types";

// A Record keyed by the union, so adding a channel to EvalSourceChannel without
// listing it here is a type error.
const EVAL_SOURCE_CHANNELS: Record<EvalSourceChannel, true> = {
  notebook: true,
  web: true,
  academic: true,
  news: true,
  finance: true,
};

function isEvalSourceChannel(value: string): value is EvalSourceChannel {
  return Object.hasOwn(EVAL_SOURCE_CHANNELS, value);
}

/** Throws on an unknown channel instead of passing it through. */
export function parseEvalSourceChannel(value: string): EvalSourceChannel {
  if (!isEvalSourceChannel(value)) {
    throw new Error(
      `Unknown source channel "${value}". Expected one of: ${Object.keys(EVAL_SOURCE_CHANNELS).join(", ")}`
    );
  }
  return value;
}

export function parseEvalSourceChannels(values: readonly string[]): EvalSourceChannel[] {
  return values.map(parseEvalSourceChannel);
}

/** Narrows a server-echoed policy (`channels: string[]`) to the eval type. */
export function toEvalSourcePolicy(
  policy:
    | {
        channels: string[];
        maxResultsPerChannel?: number;
        domainAllowlist?: string[];
        recencyDays?: number;
      }
    | undefined
): SourcePolicyConfig | undefined {
  if (!policy) return undefined;
  return { ...policy, channels: parseEvalSourceChannels(policy.channels) };
}
