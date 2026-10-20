import { describe, expect, it } from "vitest";
import {
  assertMapFailuresAcceptable,
  MAP_CHUNK_MAX_ATTEMPTS,
  mapChunkRetryDelayMs,
  mapFailureRate,
  TooManyMapFailuresError,
  tooManyMapFailures,
} from "./mapFailures";

describe("mapChunkRetryDelayMs", () => {
  it("retries a first failure after 20 s and a second after 40 s", () => {
    expect(mapChunkRetryDelayMs(undefined)).toBe(20_000);
    expect(mapChunkRetryDelayMs(1)).toBe(20_000);
    expect(mapChunkRetryDelayMs(2)).toBe(40_000);
  });

  it("stops once the chunk has used all its attempts", () => {
    expect(mapChunkRetryDelayMs(MAP_CHUNK_MAX_ATTEMPTS)).toBeNull();
    expect(mapChunkRetryDelayMs(MAP_CHUNK_MAX_ATTEMPTS + 1)).toBeNull();
  });
});

describe("tooManyMapFailures", () => {
  it.each([
    [90, 0, false],
    [90, 9, false], // exactly 10%
    [90, 10, true],
    [90, 40, true], // the Pharmacology report on dev
    [10, 1, false],
    [3, 1, true],
    [1, 1, true],
    [0, 0, false],
  ])("%i chunks, %i failed → %s", (total, failed, expected) => {
    expect(tooManyMapFailures(total, failed)).toBe(expected);
  });
});

describe("assertMapFailuresAcceptable", () => {
  it("throws a user-facing error naming the share that failed", () => {
    expect(() => assertMapFailuresAcceptable(90, 40)).toThrow(TooManyMapFailuresError);
    expect(() => assertMapFailuresAcceptable(90, 40)).toThrow(
      /40 of 90 source sections couldn't be processed/
    );
  });

  it("passes when few chunks failed", () => {
    expect(() => assertMapFailuresAcceptable(90, 3)).not.toThrow();
  });
});

describe("mapFailureRate", () => {
  it("rounds to three places and handles an empty job", () => {
    expect(mapFailureRate(90, 40)).toBe(0.444);
    expect(mapFailureRate(0, 0)).toBe(0);
  });
});
