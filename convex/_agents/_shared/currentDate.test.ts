import { describe, expect, it } from "vitest";
import { currentDateInstruction, withCurrentDate } from "./currentDate";

describe("currentDateInstruction", () => {
  it("states today's date and how to treat dated facts", () => {
    const text = currentDateInstruction(new Date("2026-10-20T15:00:00Z"));
    expect(text).toContain("Today's date is October 20, 2026 (2026-10-20).");
    expect(text).toContain("has ended or expired");
  });
});

describe("withCurrentDate", () => {
  it("appends the date to the system prompt", () => {
    const prompt = withCurrentDate("You write reports.", new Date("2026-01-05T00:00:00Z"));
    expect(prompt.startsWith("You write reports.\n\nToday's date is January 5, 2026")).toBe(true);
  });
});
