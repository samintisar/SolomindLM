import { describe, expect, it } from "vitest";
import { resolveAskSources } from "./askSources";

const src = (id: string, status = "completed", selected = false) => ({ id, status, selected });

describe("resolveAskSources", () => {
  it("overrides with the preferred sources, in preferred order", () => {
    const sources = [src("a"), src("b"), src("c")];
    expect(resolveAskSources(sources, ["c", "a"])).toEqual({
      kind: "override",
      documentIds: ["c", "a"],
    });
  });

  it("drops preferred sources that were deleted or are still processing", () => {
    const sources = [src("a"), src("b", "processing")];
    expect(resolveAskSources(sources, ["a", "b", "gone"])).toEqual({
      kind: "override",
      documentIds: ["a"],
    });
  });

  it("de-duplicates preferred ids", () => {
    const sources = [src("a"), src("b")];
    expect(resolveAskSources(sources, ["a", "b", "a"])).toEqual({
      kind: "override",
      documentIds: ["a", "b"],
    });
  });

  it("uses the current selection when nothing is preferred", () => {
    expect(resolveAskSources([src("a", "completed", true)], undefined)).toEqual({
      kind: "selection",
    });
  });

  it("uses the current selection when none of the preferred sources remain", () => {
    const sources = [src("a", "completed", true)];
    expect(resolveAskSources(sources, ["gone"])).toEqual({ kind: "selection" });
  });

  it("does not count a selected source that is not completed", () => {
    expect(resolveAskSources([src("a", "processing", true)], undefined)).toEqual({ kind: "none" });
  });

  it("returns none when nothing is usable", () => {
    expect(resolveAskSources([src("a")], undefined)).toEqual({ kind: "none" });
    expect(resolveAskSources([], ["a"])).toEqual({ kind: "none" });
  });

  it("treats an empty preferred array like none preferred", () => {
    expect(resolveAskSources([src("a", "completed", true)], [])).toEqual({ kind: "selection" });
    expect(resolveAskSources([src("a")], [])).toEqual({ kind: "none" });
  });
});
