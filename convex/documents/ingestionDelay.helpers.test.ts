import { describe, expect, test } from "vitest";
import { ingestionDelayMs, YOUTUBE_INGESTION_STAGGER_MS } from "./ingestionDelay.helpers";

describe("ingestionDelayMs", () => {
  test("spreads YouTube jobs over the stagger window", () => {
    expect(ingestionDelayMs("youtube", () => 0)).toBe(0);
    expect(ingestionDelayMs("youtube", () => 0.5)).toBe(YOUTUBE_INGESTION_STAGGER_MS / 2);
    expect(ingestionDelayMs("youtube", () => 0.9999)).toBeLessThan(YOUTUBE_INGESTION_STAGGER_MS);
  });

  test("starts every other source type at once", () => {
    for (const type of ["url", "text", "file", "paper_record"]) {
      expect(ingestionDelayMs(type, () => 0.5)).toBe(0);
    }
  });
});
