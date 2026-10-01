import { describe, expect, it } from "vitest";
import {
  areaOf,
  blockedIncreases,
  compareCounts,
  countViolations,
  isDegradedRun,
  type LintResult,
  rulesInBaseline,
  sortCounts,
} from "./baseline";

const msg = (ruleId: string | null, severity = 1) => ({ ruleId, severity, message: "m", line: 1 });

describe("areaOf", () => {
  it("groups feature files by feature", () => {
    expect(areaOf("C:\\repo\\apps\\web\\src\\features\\chat\\components\\X.tsx")).toBe(
      "features/chat"
    );
  });
  it("groups shared files under shared", () => {
    expect(areaOf("/repo/apps/web/src/shared/components/ui/button.tsx")).toBe("shared");
  });
  it("puts top-level src files under root", () => {
    expect(areaOf("/repo/apps/web/src/App.tsx")).toBe("root");
  });
  it("uses the first dir for other src dirs", () => {
    expect(areaOf("/repo/apps/web/src/hooks/useX.tsx")).toBe("hooks");
  });
});

describe("countViolations", () => {
  const results: LintResult[] = [
    {
      filePath: "/r/src/features/chat/A.tsx",
      messages: [msg("shadcn/no-raw-colors"), msg("shadcn/no-raw-colors", 2), msg("other/rule")],
    },
    { filePath: "/r/src/shared/B.tsx", messages: [msg("shadcn/no-inline-styles")] },
    {
      filePath: "/r/src/C.tsx",
      messages: [{ ...msg(null, 2), fatal: true, message: "Parse error" }],
    },
  ];

  it("counts shadcn warnings and errors per area and rule", () => {
    expect(countViolations(results).counts).toEqual({
      "features/chat": { "shadcn/no-raw-colors": 2 },
      shared: { "shadcn/no-inline-styles": 1 },
    });
  });

  it("collects fatal parse errors", () => {
    expect(countViolations(results).fatal).toEqual(["/r/src/C.tsx: Parse error"]);
  });
});

describe("countViolations prefixes", () => {
  it("counts solomind/ rules alongside shadcn/", () => {
    const { counts } = countViolations([
      {
        filePath: "/r/src/features/chat/A.tsx",
        messages: [msg("solomind/soft-surfaces"), msg("other/rule")],
      },
    ]);
    expect(counts).toEqual({ "features/chat": { "solomind/soft-surfaces": 1 } });
  });
});

describe("compareCounts", () => {
  const baseline = { "features/chat": { "shadcn/no-raw-colors": 5, "shadcn/no-inline-styles": 1 } };

  it("reports increases, including new areas and rules", () => {
    const current = {
      "features/chat": { "shadcn/no-raw-colors": 6, "shadcn/no-inline-styles": 1 },
      "features/studio": { "shadcn/no-arbitrary-values": 1 },
    };
    expect(compareCounts(current, baseline).increases).toEqual([
      { area: "features/chat", rule: "shadcn/no-raw-colors", baseline: 5, current: 6 },
      { area: "features/studio", rule: "shadcn/no-arbitrary-values", baseline: 0, current: 1 },
    ]);
  });

  it("reports decreases, including rules that reached zero", () => {
    const current = { "features/chat": { "shadcn/no-raw-colors": 3 } };
    const { increases, decreases } = compareCounts(current, baseline);
    expect(increases).toEqual([]);
    expect(decreases).toEqual([
      { area: "features/chat", rule: "shadcn/no-inline-styles", baseline: 1, current: 0 },
      { area: "features/chat", rule: "shadcn/no-raw-colors", baseline: 5, current: 3 },
    ]);
  });
});

describe("blockedIncreases", () => {
  const baseline = { "features/chat": { "shadcn/no-raw-colors": 5 } };
  const fresh = {
    "features/chat": { "shadcn/no-raw-colors": 5, "solomind/soft-surfaces": 3 },
    shared: { "solomind/soft-surfaces": 2 },
  };
  const blocked = (
    current: typeof fresh | Record<string, Record<string, number>>,
    opts: { update: boolean; newRules?: string[] }
  ) =>
    blockedIncreases(compareCounts(current, baseline).increases, baseline, {
      update: opts.update,
      newRules: opts.newRules ?? [],
    });

  it("blocks a new rule when it was not named with --new-rule", () => {
    expect(blocked(fresh, { update: true })).toHaveLength(2);
  });

  it("allows a new rule that was named with --new-rule", () => {
    expect(blocked(fresh, { update: true, newRules: ["solomind/soft-surfaces"] })).toEqual([]);
  });

  it("blocks a flagged rule that is already in the baseline", () => {
    const current = { "features/chat": { "shadcn/no-raw-colors": 6 } };
    expect(blocked(current, { update: true, newRules: ["shadcn/no-raw-colors"] })).toHaveLength(1);
  });

  it("blocks a rule that was fixed to zero, dropped from the baseline and came back", () => {
    // sortCounts drops zero counts, so the regressed rule is absent from the baseline like a new one.
    const current = {
      "features/chat": { "shadcn/no-raw-colors": 5, "shadcn/no-inline-styles": 1 },
    };
    expect(blocked(current, { update: true })).toHaveLength(1);
  });

  it("blocks every increase outside update mode, flagged or not", () => {
    expect(blocked(fresh, { update: false, newRules: ["solomind/soft-surfaces"] })).toHaveLength(2);
  });
});

describe("rulesInBaseline", () => {
  it("returns the requested rules that the baseline already tracks", () => {
    const baseline = { a: { "r/x": 1 }, b: { "r/y": 2 } };
    expect(rulesInBaseline(["r/y", "r/z"], baseline)).toEqual(["r/y"]);
  });
});

describe("sortCounts", () => {
  it("sorts areas and rules and drops zeros and empty areas", () => {
    const sorted = sortCounts({
      b: { "r/z": 1, "r/a": 0 },
      a: { "r/b": 2, "r/a": 1 },
      c: { "r/x": 0 },
    });
    expect(JSON.stringify(sorted)).toBe('{"a":{"r/a":1,"r/b":2},"b":{"r/z":1}}');
  });
});

describe("isDegradedRun", () => {
  it("returns the plugin's warnings, which mean counts may differ from the baseline", () => {
    const stderr = [
      "some unrelated ESLint noise",
      "[@shadcn/lint] The Tailwind worker failed twice (timeout); no-unknown-classes is using the grammar bundled with @shadcn/lint for the rest of this run.",
    ].join("\n");
    expect(isDegradedRun(stderr)).toEqual([
      "[@shadcn/lint] The Tailwind worker failed twice (timeout); no-unknown-classes is using the grammar bundled with @shadcn/lint for the rest of this run.",
    ]);
  });

  it("returns nothing for a clean run", () => {
    expect(isDegradedRun("")).toEqual([]);
    expect(isDegradedRun("DeprecationWarning: something else\n")).toEqual([]);
  });
});
