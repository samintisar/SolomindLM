/**
 * Helper to generate source-filtered variants of a base fixture.
 *
 * Usage: define one base fixture, then call `withSourceMatrix()` to
 * produce N variants with different channel combinations.
 */
import type { EvalFixture, SourcePolicyConfig } from "../types";

/** Common channel combinations to test */
export const DEFAULT_SOURCE_MATRIX: SourcePolicyConfig[] = [
  { channels: ["notebook"] },
  { channels: ["notebook", "web"] },
  { channels: ["notebook", "web", "news"] },
  { channels: ["notebook", "academic"] },
  { channels: ["notebook", "web", "news", "academic"] },
];

/**
 * Generate source-filtered variants of a base fixture.
 *
 * @param base - The base fixture (should NOT have sourcePolicy set)
 * @param matrix - Channel combinations to test (default: 5 common combos)
 * @returns Array of fixture variants, each with a unique id and sourcePolicy
 */
export function withSourceMatrix(
  base: EvalFixture,
  matrix: SourcePolicyConfig[] = DEFAULT_SOURCE_MATRIX
): EvalFixture[] {
  return matrix.map((policy, index) => ({
    ...base,
    id: `${base.id}--src${index}`,
    schemaVersion: base.schemaVersion + 1,
    sourcePolicy: policy,
    tags: [...base.tags, `source-matrix`, `channels-${policy.channels.join("-")}`],
  }));
}

/**
 * Generate a source matrix focused on academic vs web comparison.
 */
export function withAcademicWebMatrix(base: EvalFixture): EvalFixture[] {
  return withSourceMatrix(base, [
    { channels: ["notebook"] },
    { channels: ["notebook", "web"] },
    { channels: ["notebook", "academic"] },
    { channels: ["notebook", "web", "academic"] },
  ]);
}

/**
 * Generate a source matrix for news-sensitive queries.
 */
export function withNewsMatrix(base: EvalFixture): EvalFixture[] {
  return withSourceMatrix(base, [
    { channels: ["notebook"] },
    { channels: ["notebook", "news"] },
    { channels: ["notebook", "web", "news"] },
  ]);
}
