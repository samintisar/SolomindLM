import { describe, expect, it } from "vitest";
import {
  SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS,
  SEMANTIC_SCHOLAR_UNAUTHENTICATED_INTERVAL_MS,
} from "./semanticScholarThrottle";

describe("semanticScholarThrottle config", () => {
  it("targets 1 RPS with API key per Semantic Scholar introductory limits", () => {
    expect(SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS).toBe(1000);
    expect(SEMANTIC_SCHOLAR_UNAUTHENTICATED_INTERVAL_MS).toBeGreaterThan(
      SEMANTIC_SCHOLAR_AUTHENTICATED_INTERVAL_MS
    );
  });
});
