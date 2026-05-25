import { describe, expect, it } from "vitest";
import { mapDeepResearchSteps } from "./deepResearchSteps";

describe("mapDeepResearchSteps", () => {
  it("maps visible steps and attaches plan search queries to searching", () => {
    const steps = mapDeepResearchSteps(
      [
        { stepType: "planning", status: "completed", details: "ignored" },
        {
          stepType: "searching",
          status: "completed",
          details: "Retrieved 12 evidence entries",
        },
        {
          stepType: "generating_report",
          status: "in_progress",
          details: "Synthesizing",
        },
      ],
      [{ searchQueries: ["quantum error correction", "topological qubits"] }]
    );

    expect(steps).toHaveLength(2);
    expect(steps[0]?.type).toBe("searching");
    expect(steps[0]?.searchQueries).toEqual([
      "quantum error correction",
      "topological qubits",
    ]);
    expect(steps[1]?.type).toBe("generating_report");
  });

  it("omits redundant report-complete details", () => {
    const steps = mapDeepResearchSteps(
      [
        {
          stepType: "generating_report",
          status: "completed",
          details: "Report generation complete",
        },
      ],
      []
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]?.details).toBeUndefined();
  });

  it("does not surface legacy populating steps", () => {
    const steps = mapDeepResearchSteps(
      [
        {
          stepType: "populating",
          status: "completed",
          details: "Created table abc and report def",
        },
      ],
      []
    );

    expect(steps).toHaveLength(0);
  });
});
