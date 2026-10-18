import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { getFixture, listFixtureIds } from ".";
import { loadFixtureSourceTexts } from "./sourceFiles";

const fixture = (sourceFiles?: string[]) =>
  ({ id: "case-x", sourceFiles }) as unknown as EvalFixture;

describe("loadFixtureSourceTexts", () => {
  it("returns undefined for a fixture without source files", () => {
    expect(loadFixtureSourceTexts(fixture())).toBeUndefined();
  });

  it("reads each named source as a SourceText", () => {
    const texts = loadFixtureSourceTexts(fixture(["master-20-agentic-patterns.md"]));
    expect(texts).toHaveLength(1);
    expect(texts?.[0]?.fileName).toBe("master-20-agentic-patterns.md");
    expect(texts?.[0]?.text.length).toBeGreaterThan(1000);
  });

  it("names the fixture and file when a source is missing", () => {
    expect(() => loadFixtureSourceTexts(fixture(["nope.md"]))).toThrow(/case-x.*nope\.md/);
  });

  it("every fixture's source files exist", () => {
    for (const id of listFixtureIds()) {
      const f = getFixture(id);
      if (f.sourceFiles) expect(() => loadFixtureSourceTexts(f), id).not.toThrow();
    }
  });
});
