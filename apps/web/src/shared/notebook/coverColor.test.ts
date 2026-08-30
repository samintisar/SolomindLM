import { describe, expect, it } from "vitest";
import { COVER_ICON_CLASS, coverFillClass, DEFAULT_COVER_COLOR } from "./coverColor";

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
