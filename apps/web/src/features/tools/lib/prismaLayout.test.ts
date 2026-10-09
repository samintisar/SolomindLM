import { describe, expect, it } from "vitest";
import { createEmptyPrismaState } from "./prismaFlow";
import { layoutPrismaFlow, wrapText } from "./prismaLayout";

describe("wrapText", () => {
  it("wraps greedily on spaces", () => {
    expect(wrapText("Records marked as ineligible by automation tools (n = 3)", 32)).toEqual([
      "Records marked as ineligible by",
      "automation tools (n = 3)",
    ]);
  });

  it("splits a word longer than the line", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("keeps one empty line for empty text", () => {
    expect(wrapText("   ", 10)).toEqual([""]);
  });
});

describe("layoutPrismaFlow", () => {
  const ids = (layout: ReturnType<typeof layoutPrismaFlow>) => layout.boxes.map((b) => b.id);

  it("draws the databases-and-registers template by default", () => {
    const layout = layoutPrismaFlow(createEmptyPrismaState());
    expect(ids(layout)).toEqual([
      "header-main",
      "identified",
      "removed",
      "screened",
      "excluded",
      "sought",
      "not-retrieved",
      "assessed",
      "reports-excluded",
      "included",
      "phase-identification",
      "phase-screening",
      "phase-included",
    ]);
    expect(layout.arrows.map((a) => a.id)).toEqual([
      "identified-screened",
      "screened-sought",
      "sought-assessed",
      "assessed-included",
      "identified-removed",
      "screened-excluded",
      "sought-not-retrieved",
      "assessed-reports-excluded",
    ]);
  });

  it("fills counts and reason lines into the boxes", () => {
    const state = createEmptyPrismaState();
    state.main.recordsScreened = 325;
    state.reasons[0]!.label = "Wrong population";
    state.reasons[0]!.count = 12;
    const layout = layoutPrismaFlow(state);
    const box = (id: string) => layout.boxes.find((b) => b.id === id)!;
    expect(box("screened").lines).toEqual(["Records screened (n = 325)"]);
    expect(box("reports-excluded").lines).toEqual([
      "Reports excluded:",
      "Wrong population (n = 12)",
      "Reason 2 (n = )",
      "Reason 3 (n = )",
    ]);
  });

  it("adds the other-methods column, its header and the elbow into Included", () => {
    const state = createEmptyPrismaState();
    state.otherMethods = true;
    const layout = layoutPrismaFlow(state);
    expect(ids(layout)).toEqual(
      expect.arrayContaining([
        "header-other",
        "other-identified",
        "other-sought",
        "other-not-retrieved",
        "other-assessed",
        "other-reports-excluded",
      ])
    );
    const elbow = layout.arrows.find((a) => a.id === "other-assessed-included")!;
    expect(elbow.points).toHaveLength(3);
    expect(layout.width).toBeGreaterThan(layoutPrismaFlow(createEmptyPrismaState()).width);
  });

  it("keeps boxes in a row the same height and rows in order", () => {
    const state = createEmptyPrismaState();
    state.reasons.push(...state.reasons.map((r) => ({ ...r, id: `${r.id}-copy` })));
    const layout = layoutPrismaFlow(state);
    const box = (id: string) => layout.boxes.find((b) => b.id === id)!;
    expect(box("assessed").h).toBe(box("reports-excluded").h);
    expect(box("screened").y).toBeGreaterThan(box("identified").y + box("identified").h);
    expect(box("included").y + box("included").h).toBeLessThanOrEqual(layout.height);
  });
});
