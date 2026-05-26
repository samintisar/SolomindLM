import { describe, expect, it } from "vitest";
import { literatureReportToolbarLabel } from "./literatureReportLabels";

describe("literatureReportToolbarLabel", () => {
  it("labels literature review session reports", () => {
    expect(literatureReportToolbarLabel("session123")).toBe("Literature Report");
  });

  it("labels deep research reports without a session", () => {
    expect(literatureReportToolbarLabel(undefined)).toBe("Deep Research");
  });
});
