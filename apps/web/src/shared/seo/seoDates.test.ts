import { describe, expect, it } from "vitest";
import { buildSeoTimeHtml, buildUpdatedLineHtml, formatSeoDate } from "./seoDates";

describe("formatSeoDate", () => {
  it("formats an ISO date as a long US date in UTC", () => {
    expect(formatSeoDate("2026-10-07")).toBe("October 7, 2026");
    expect(formatSeoDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(() => formatSeoDate("2026-10-07T12:00:00Z")).toThrow(/YYYY-MM-DD/);
    expect(() => formatSeoDate("October 7")).toThrow(/YYYY-MM-DD/);
  });
});

describe("buildUpdatedLineHtml", () => {
  it("wraps the date in a machine-readable <time>", () => {
    expect(buildSeoTimeHtml("2026-09-15")).toBe(
      '<time datetime="2026-09-15">September 15, 2026</time>'
    );
    expect(buildUpdatedLineHtml("2026-09-15")).toBe(
      '<p>Updated <time datetime="2026-09-15">September 15, 2026</time></p>'
    );
  });
});
