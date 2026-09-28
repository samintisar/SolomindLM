import { describe, expect, it } from "vitest";
import { COVER_COLORS, COVER_ICON_CLASS, coverFillClass, DEFAULT_COVER_COLOR } from "./coverColor";

describe("coverFillClass", () => {
  it("returns the stored bg- class unchanged", () => {
    expect(coverFillClass("bg-vintage-blue-400")).toBe("bg-vintage-blue-400");
  });

  it("falls back to the default cover when the value is missing", () => {
    expect(coverFillClass(undefined)).toBe(DEFAULT_COVER_COLOR);
    expect(coverFillClass(null)).toBe(DEFAULT_COVER_COLOR);
    expect(coverFillClass("")).toBe(DEFAULT_COVER_COLOR);
  });

  it("falls back when the value is not a bg- class", () => {
    expect(coverFillClass("vintage-brown-300")).toBe(DEFAULT_COVER_COLOR);
  });
});

describe("COVER_ICON_CLASS", () => {
  it("uses foreground ink for contrast on a solid cover", () => {
    expect(COVER_ICON_CLASS).toBe("text-foreground");
  });
});

describe("COVER_COLORS", () => {
  it("contains the default cover", () => {
    expect(COVER_COLORS).toContain(DEFAULT_COVER_COLOR);
  });

  it("has 18 unique swatches", () => {
    expect(new Set(COVER_COLORS).size).toBe(18);
  });
});

describe("coverFillClass with unknown classes", () => {
  it("falls back when a stored bg- class is not a known swatch", () => {
    expect(coverFillClass("bg-pink-500")).toBe(DEFAULT_COVER_COLOR);
  });
});

describe("coverFillClass with legacy values", () => {
  it("maps retired palette swatches to their current equivalents", () => {
    expect(coverFillClass("bg-blue-500")).toBe("bg-vintage-blue-500");
    expect(coverFillClass("bg-yellow-500")).toBe("bg-vintage-amber-400");
  });
});

describe("DEFAULT_COVER_COLOR", () => {
  it("pins the persisted default", () => {
    // The Convex backend hardcodes this literal.
    expect(DEFAULT_COVER_COLOR).toBe("bg-vintage-brown-300");
  });
});
