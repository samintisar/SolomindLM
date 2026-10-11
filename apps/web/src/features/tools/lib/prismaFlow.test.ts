import { describe, expect, it } from "vitest";
import {
  checkPrismaCounts,
  createEmptyPrismaState,
  formatCount,
  isPrismaStateEmpty,
  MAX_COUNT,
  newReason,
  type PrismaFlowState,
  parseCount,
  reasonLabel,
  total,
} from "./prismaFlow";

function stateWith(patch: (state: PrismaFlowState) => void): PrismaFlowState {
  const state = createEmptyPrismaState();
  patch(state);
  return state;
}

describe("parseCount", () => {
  it("reads digits and ignores separators", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount(" 42 ")).toBe(42);
    expect(parseCount("007")).toBe(7);
  });

  it("returns null for blank input", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("   ")).toBeNull();
  });

  it("rejects anything that isn't a whole, non-negative count", () => {
    for (const input of ["-5", "+3", "1.5", "2e3", "abc", "3a"]) {
      expect(parseCount(input), input).toBeUndefined();
    }
  });

  it("caps huge numbers", () => {
    expect(parseCount("9".repeat(40))).toBe(MAX_COUNT);
  });
});

describe("formatting", () => {
  it("prints the template's blank (n = ) for an empty count", () => {
    expect(formatCount(null)).toBe("(n = )");
    expect(formatCount(0)).toBe("(n = 0)");
  });

  it("falls back to a numbered reason label", () => {
    expect(reasonLabel(newReason("  "), 1)).toBe("Reason 2");
    expect(reasonLabel(newReason("Wrong population"), 0)).toBe("Wrong population");
  });

  it("totals filled numbers and is null when all are blank", () => {
    expect(total([1, null, 2])).toBe(3);
    expect(total([null, null])).toBeNull();
  });
});

describe("createEmptyPrismaState", () => {
  it("starts blank with three reason rows per column and unique reason ids", () => {
    const state = createEmptyPrismaState();
    expect(Object.values(state.main).every((v) => v === null)).toBe(true);
    expect(state.reasons).toHaveLength(3);
    expect(state.otherReasons).toHaveLength(3);
    const ids = [...state.reasons, ...state.otherReasons].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(isPrismaStateEmpty(state)).toBe(true);
  });

  it("is no longer empty once a count, a reason or other methods is set", () => {
    expect(isPrismaStateEmpty(stateWith((s) => (s.main.databases = 0)))).toBe(false);
    expect(isPrismaStateEmpty(stateWith((s) => (s.reasons[0]!.label = "Wrong design")))).toBe(
      false
    );
    expect(isPrismaStateEmpty(stateWith((s) => (s.otherMethods = true)))).toBe(false);
  });
});

describe("checkPrismaCounts", () => {
  it("returns nothing for a blank or consistent diagram", () => {
    expect(checkPrismaCounts(createEmptyPrismaState())).toEqual([]);
    const consistent = stateWith((s) => {
      Object.assign(s.main, {
        databases: 400,
        registers: 12,
        duplicatesRemoved: 87,
        recordsScreened: 325,
        recordsExcluded: 250,
        reportsSought: 75,
        reportsNotRetrieved: 5,
        reportsAssessed: 70,
        studiesIncluded: 30,
        reportsIncluded: 40,
      });
      s.reasons[0]!.count = 20;
      s.reasons[1]!.count = 10;
    });
    expect(checkPrismaCounts(consistent)).toEqual([]);
  });

  it("flags records screened that don't match identified minus removed", () => {
    const state = stateWith((s) => {
      s.main.databases = 400;
      s.main.registers = 12;
      s.main.duplicatesRemoved = 87;
      s.main.recordsScreened = 320;
    });
    expect(checkPrismaCounts(state)).toEqual([
      {
        field: "recordsScreened",
        message: "Identified 412 − removed 87 = 325, but records screened is 320.",
      },
    ]);
  });

  it("flags reports assessed that don't match sought minus not retrieved, per column", () => {
    const state = stateWith((s) => {
      s.main.reportsSought = 75;
      s.main.reportsNotRetrieved = 5;
      s.main.reportsAssessed = 69;
      s.otherMethods = true;
      s.other.reportsSought = 10;
      s.other.reportsAssessed = 9;
    });
    expect(checkPrismaCounts(state).map((w) => w.field)).toEqual([
      "reportsAssessed",
      "otherReportsAssessed",
    ]);
    expect(checkPrismaCounts(state)[1]!.message).toBe(
      "Sought 10 − not retrieved 0 = 10, but reports assessed is 9."
    );
  });

  it("ignores the other-methods column while it is switched off", () => {
    const state = stateWith((s) => {
      s.other.reportsSought = 10;
      s.other.reportsAssessed = 9;
    });
    expect(checkPrismaCounts(state)).toEqual([]);
  });

  it("flags included reports that don't match assessed minus excluded across both columns", () => {
    const state = stateWith((s) => {
      s.main.reportsAssessed = 70;
      s.reasons[0]!.count = 30;
      s.otherMethods = true;
      s.other.reportsAssessed = 10;
      s.otherReasons[0]!.count = 5;
      s.main.reportsIncluded = 40;
    });
    expect(checkPrismaCounts(state)).toEqual([
      {
        field: "reportsIncluded",
        message: "Assessed 80 − excluded 35 = 45, but reports of included studies is 40.",
      },
    ]);
  });

  it("does not compare studies with reports: one report can describe several studies", () => {
    const state = stateWith((s) => {
      s.main.studiesIncluded = 12;
      s.main.reportsIncluded = 10;
    });
    expect(checkPrismaCounts(state)).toEqual([]);
  });
});
