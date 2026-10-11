# Free PRISMA 2020 Flow-Diagram Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, no-signup page at `/tools/prisma-flow-diagram` where a reviewer types PRISMA 2020 counts, sees the diagram update live, and downloads it as SVG or PNG.

**Architecture:** Browser only, no Convex. Pure modules for state and warnings (`prismaFlow.ts`), URL-hash persistence (`prismaUrlState.ts`) and geometry (`prismaLayout.ts`); a React SVG renderer (`PrismaDiagram.tsx`) and a form (`PrismaForm.tsx`); export helpers (`exportDiagram.ts`); a page registered through the existing free-tool registry (`toolPages.ts`), which already drives SEO metadata, prerendering, structured data and the footer. The flashcards page's header and article are extracted into shared components so both tool pages use them.

**Tech Stack:** React 19, React Router 7, Tailwind 4, shadcn primitives in `@/shared/components/ui`, Vitest + Testing Library, Playwright.

Spec: `docs/superpowers/specs/2026-10-09-free-prisma-flow-diagram-tool-design.md` · Issue #459

Commands run from the repo root. Single web test file: `bun run --cwd apps/web test -- <path relative to apps/web>`.

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `apps/web/src/features/tools/lib/prismaFlow.ts` | Create | State types, empty state, count parsing/formatting, warnings |
| `apps/web/src/features/tools/lib/prismaFlow.test.ts` | Create | Unit tests |
| `apps/web/src/features/tools/lib/prismaUrlState.ts` | Create | Hash encode/decode |
| `apps/web/src/features/tools/lib/prismaUrlState.test.ts` | Create | Unit tests |
| `apps/web/src/features/tools/lib/prismaLayout.ts` | Create | Text wrapping and diagram geometry |
| `apps/web/src/features/tools/lib/prismaLayout.test.ts` | Create | Unit tests |
| `apps/web/src/features/tools/components/PrismaDiagram.tsx` | Create | SVG renderer |
| `apps/web/src/features/tools/lib/exportDiagram.ts` | Create | SVG serialization, SVG/PNG download |
| `apps/web/src/features/tools/lib/exportDiagram.test.tsx` | Create | Serialization test |
| `apps/web/src/features/tools/components/PrismaForm.tsx` | Create | Count form, reasons editor, other-methods switch |
| `apps/web/src/features/tools/components/PrismaForm.test.tsx` | Create | Form ↔ diagram tests |
| `apps/web/src/features/tools/components/ToolPageChrome.tsx` | Create | Shared `ToolHeader` and `ToolArticle` |
| `apps/web/src/features/tools/pages/PdfToFlashcardsPage.tsx` | Modify | Use the shared chrome |
| `apps/web/src/features/tools/toolPages.ts` | Modify | `PRISMA_FLOW_DIAGRAM_PAGE` |
| `apps/web/src/features/tools/pages/PrismaFlowDiagramPage.tsx` | Create | The page |
| `apps/web/src/shell/publicRoutes.tsx` | Modify | Route |
| `apps/web/src/features/landing/intentLandingPages.ts` | Modify | Cross-link from `/research/ai-literature-review` |
| `apps/web/src/shared/seo/seoHtml.test.ts` | Modify | Registration and cross-link tests |
| `apps/web/public/sitemap.xml`, `apps/web/public/llms.txt` | Modify | Discovery |
| `e2e/tools/prisma-flow-diagram.spec.ts` | Create | E2E |
| `e2e/csp/csp.spec.ts` | Modify | CSP coverage |

---

### Task 1: State, parsing and warnings (`prismaFlow.ts`)

**Files:**
- Create: `apps/web/src/features/tools/lib/prismaFlow.ts`
- Test: `apps/web/src/features/tools/lib/prismaFlow.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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

  it("returns null for blank or digit-free input", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("abc")).toBeNull();
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
    expect(isPrismaStateEmpty(stateWith((s) => (s.reasons[0]!.label = "Wrong design")))).toBe(false);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/prismaFlow.test.ts`
Expected: FAIL — `Failed to resolve import "./prismaFlow"`.

- [ ] **Step 3: Implement**

```ts
/** A box count: a whole number, or null while the field is blank. */
export type Count = number | null;

export type ExclusionReason = { id: string; label: string; count: Count };

export type MainCounts = {
  databases: Count;
  registers: Count;
  duplicatesRemoved: Count;
  automationRemoved: Count;
  otherRemoved: Count;
  recordsScreened: Count;
  recordsExcluded: Count;
  reportsSought: Count;
  reportsNotRetrieved: Count;
  reportsAssessed: Count;
  studiesIncluded: Count;
  reportsIncluded: Count;
};

export type OtherCounts = {
  websites: Count;
  organisations: Count;
  citationSearching: Count;
  reportsSought: Count;
  reportsNotRetrieved: Count;
  reportsAssessed: Count;
};

/** Everything the PRISMA 2020 (new review) diagram shows. */
export type PrismaFlowState = {
  main: MainCounts;
  reasons: ExclusionReason[];
  /** Draws the "other methods" column (websites, organisations, citation searching). */
  otherMethods: boolean;
  other: OtherCounts;
  otherReasons: ExclusionReason[];
};

/** Key order is the URL wire format: append new keys, never reorder. */
export const MAIN_COUNT_KEYS = [
  "databases",
  "registers",
  "duplicatesRemoved",
  "automationRemoved",
  "otherRemoved",
  "recordsScreened",
  "recordsExcluded",
  "reportsSought",
  "reportsNotRetrieved",
  "reportsAssessed",
  "studiesIncluded",
  "reportsIncluded",
] as const satisfies readonly (keyof MainCounts)[];

export const OTHER_COUNT_KEYS = [
  "websites",
  "organisations",
  "citationSearching",
  "reportsSought",
  "reportsNotRetrieved",
  "reportsAssessed",
] as const satisfies readonly (keyof OtherCounts)[];

export const MAX_COUNT = 9_999_999;
export const MAX_REASONS = 12;
export const MAX_REASON_LABEL = 80;
const DEFAULT_REASON_ROWS = 3;

let reasonSeq = 0;

/** A reason row with a fresh id (React key only; ids are not saved in the URL). */
export function newReason(label = "", count: Count = null): ExclusionReason {
  reasonSeq += 1;
  return { id: `reason-${reasonSeq}`, label, count };
}

function blankCounts<K extends string>(keys: readonly K[]): Record<K, Count> {
  return Object.fromEntries(keys.map((key) => [key, null])) as Record<K, Count>;
}

const blankReasons = () => Array.from({ length: DEFAULT_REASON_ROWS }, () => newReason());

export function createEmptyPrismaState(): PrismaFlowState {
  return {
    main: blankCounts(MAIN_COUNT_KEYS),
    reasons: blankReasons(),
    otherMethods: false,
    other: blankCounts(OTHER_COUNT_KEYS),
    otherReasons: blankReasons(),
  };
}

/** True while nothing has been typed: no counts, no named or counted reasons, other methods off. */
export function isPrismaStateEmpty(state: PrismaFlowState): boolean {
  const noCounts = (counts: Record<string, Count>) =>
    Object.values(counts).every((value) => value === null);
  const noReasons = (reasons: ExclusionReason[]) =>
    reasons.every((reason) => reason.label.trim() === "" && reason.count === null);
  return (
    !state.otherMethods &&
    noCounts(state.main) &&
    noCounts(state.other) &&
    noReasons(state.reasons) &&
    noReasons(state.otherReasons)
  );
}

/** Reads a typed count: digits only (commas and spaces ignored), capped at MAX_COUNT; blank → null. */
export function parseCount(input: string): Count {
  const digits = input.replace(/\D/g, "");
  if (digits === "") return null;
  return Math.min(Number(digits), MAX_COUNT);
}

/** The template's count suffix; a blank count prints "(n = )" like the blank template. */
export const formatCount = (count: Count) => `(n = ${count ?? ""})`;

export const reasonLabel = (reason: ExclusionReason, index: number) =>
  reason.label.trim() || `Reason ${index + 1}`;

/** Adds the filled numbers; null when every one is blank. */
export function total(counts: Count[]): Count {
  const filled = counts.filter((count): count is number => count !== null);
  return filled.length === 0 ? null : filled.reduce((sum, count) => sum + count, 0);
}

export type PrismaWarningField =
  | "recordsScreened"
  | "reportsAssessed"
  | "otherReportsAssessed"
  | "reportsIncluded";

export type PrismaWarning = { field: PrismaWarningField; message: string };

function assessedMismatch(sought: Count, notRetrieved: Count, assessed: Count): string | null {
  if (sought === null || assessed === null) return null;
  const expected = sought - (notRetrieved ?? 0);
  if (expected === assessed) return null;
  return `Sought ${sought} − not retrieved ${notRetrieved ?? 0} = ${expected}, but reports assessed is ${assessed}.`;
}

/**
 * Arithmetic checks within one unit (records, or reports). They only warn: the diagram always draws
 * what was typed. Blank parts of a sum count as 0; a check runs once both sides have a number.
 */
export function checkPrismaCounts(state: PrismaFlowState): PrismaWarning[] {
  const { main, other, otherMethods } = state;
  const warnings: PrismaWarning[] = [];

  const identified = total([main.databases, main.registers]);
  const removed = total([main.duplicatesRemoved, main.automationRemoved, main.otherRemoved]) ?? 0;
  if (
    identified !== null &&
    main.recordsScreened !== null &&
    identified - removed !== main.recordsScreened
  ) {
    warnings.push({
      field: "recordsScreened",
      message: `Identified ${identified} − removed ${removed} = ${identified - removed}, but records screened is ${main.recordsScreened}.`,
    });
  }

  const mainAssessed = assessedMismatch(
    main.reportsSought,
    main.reportsNotRetrieved,
    main.reportsAssessed
  );
  if (mainAssessed) warnings.push({ field: "reportsAssessed", message: mainAssessed });
  if (otherMethods) {
    const otherAssessed = assessedMismatch(
      other.reportsSought,
      other.reportsNotRetrieved,
      other.reportsAssessed
    );
    if (otherAssessed) warnings.push({ field: "otherReportsAssessed", message: otherAssessed });
  }

  const assessed = total(
    otherMethods ? [main.reportsAssessed, other.reportsAssessed] : [main.reportsAssessed]
  );
  const reasons = otherMethods ? [...state.reasons, ...state.otherReasons] : state.reasons;
  const excluded = total(reasons.map((reason) => reason.count));
  if (
    assessed !== null &&
    excluded !== null &&
    main.reportsIncluded !== null &&
    assessed - excluded !== main.reportsIncluded
  ) {
    warnings.push({
      field: "reportsIncluded",
      message: `Assessed ${assessed} − excluded ${excluded} = ${assessed - excluded}, but reports of included studies is ${main.reportsIncluded}.`,
    });
  }

  return warnings;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/prismaFlow.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/tools/lib/prismaFlow.ts apps/web/src/features/tools/lib/prismaFlow.test.ts
git commit -m "feat(tools): PRISMA flow state, count parsing and arithmetic warnings (#459)"
```

---

### Task 2: URL-hash state (`prismaUrlState.ts`)

**Files:**
- Create: `apps/web/src/features/tools/lib/prismaUrlState.ts`
- Test: `apps/web/src/features/tools/lib/prismaUrlState.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { createEmptyPrismaState, MAX_COUNT, MAX_REASONS, type PrismaFlowState } from "./prismaFlow";
import { decodePrismaState, encodePrismaState } from "./prismaUrlState";

const withoutIds = (state: PrismaFlowState) => ({
  ...state,
  reasons: state.reasons.map(({ label, count }) => ({ label, count })),
  otherReasons: state.otherReasons.map(({ label, count }) => ({ label, count })),
});

const toBase64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

describe("prisma URL state", () => {
  it("round-trips a filled state, unicode reason labels included", () => {
    const state = createEmptyPrismaState();
    state.main.databases = 412;
    state.main.recordsScreened = 325;
    state.reasons[0]!.label = "Población incorrecta — 対象外";
    state.reasons[0]!.count = 12;
    state.otherMethods = true;
    state.other.citationSearching = 9;

    const hash = `#${encodePrismaState(state)}`;
    expect(hash).toMatch(/^#d=[A-Za-z0-9_-]+$/);
    expect(withoutIds(decodePrismaState(hash)!)).toEqual(withoutIds(state));
  });

  it("gives decoded reasons fresh ids", () => {
    const state = createEmptyPrismaState();
    const decoded = decodePrismaState(encodePrismaState(state))!;
    const ids = decoded.reasons.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(["", "#", "#x=1", "#d=", "#d=not*base64", `#d=${toBase64Url("{nope")}`])(
    "returns null for %j",
    (hash) => {
      expect(decodePrismaState(hash)).toBeNull();
    }
  );

  it("returns null for an unknown version or an oversized hash", () => {
    expect(decodePrismaState(`#d=${toBase64Url(JSON.stringify({ v: 2 }))}`)).toBeNull();
    expect(decodePrismaState(`#d=${"A".repeat(20_001)}`)).toBeNull();
  });

  it("clamps and drops bad values instead of failing", () => {
    const wire = {
      v: 1,
      m: [-1, 2.5, "7", 1e12, 5],
      r: [["ok", 3], [42, "x"], ...Array.from({ length: 20 }, () => ["extra", 1])],
      o: 1,
      oc: null,
      or: "nope",
    };
    const state = decodePrismaState(`#d=${toBase64Url(JSON.stringify(wire))}`)!;
    expect(state.main.databases).toBeNull();
    expect(state.main.registers).toBeNull();
    expect(state.main.duplicatesRemoved).toBeNull();
    expect(state.main.automationRemoved).toBe(MAX_COUNT);
    expect(state.main.otherRemoved).toBe(5);
    expect(state.main.reportsIncluded).toBeNull();
    expect(state.reasons).toHaveLength(MAX_REASONS);
    expect(state.reasons[1]).toMatchObject({ label: "", count: null });
    expect(state.otherMethods).toBe(true);
    expect(state.other.websites).toBeNull();
    expect(state.otherReasons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/prismaUrlState.test.ts`
Expected: FAIL — `Failed to resolve import "./prismaUrlState"`.

- [ ] **Step 3: Implement**

```ts
import {
  type Count,
  type ExclusionReason,
  MAIN_COUNT_KEYS,
  MAX_COUNT,
  MAX_REASON_LABEL,
  MAX_REASONS,
  type MainCounts,
  newReason,
  OTHER_COUNT_KEYS,
  type OtherCounts,
  type PrismaFlowState,
} from "./prismaFlow";

const HASH_PARAM = "d";
const MAX_ENCODED_LENGTH = 20_000;

/** Wire format v1: counts in key order, reasons as [label, count] pairs. */
type Wire = {
  v: 1;
  m: Count[];
  r: [string, Count][];
  o: 0 | 1;
  oc: Count[];
  or: [string, Count][];
};

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function toCount(value: unknown): Count {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, MAX_COUNT)
    : null;
}

function toReasons(value: unknown): ExclusionReason[] {
  return asArray(value)
    .slice(0, MAX_REASONS)
    .map((item) => {
      const [label, count] = asArray(item);
      return newReason(typeof label === "string" ? label.slice(0, MAX_REASON_LABEL) : "", toCount(count));
    });
}

function toCounts<K extends string>(keys: readonly K[], value: unknown): Record<K, Count> {
  const values = asArray(value);
  return Object.fromEntries(keys.map((key, i) => [key, toCount(values[i])])) as Record<K, Count>;
}

/** The hash body (without "#"): `d=<base64url JSON>`. */
export function encodePrismaState(state: PrismaFlowState): string {
  const wire: Wire = {
    v: 1,
    m: MAIN_COUNT_KEYS.map((key) => state.main[key]),
    r: state.reasons.map((reason) => [reason.label, reason.count]),
    o: state.otherMethods ? 1 : 0,
    oc: OTHER_COUNT_KEYS.map((key) => state.other[key]),
    or: state.otherReasons.map((reason) => [reason.label, reason.count]),
  };
  return `${HASH_PARAM}=${toBase64Url(JSON.stringify(wire))}`;
}

/** Reads a location hash; null when it holds no valid diagram. Never throws. */
export function decodePrismaState(hash: string): PrismaFlowState | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, "")).get(HASH_PARAM);
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH) return null;

  let wire: unknown;
  try {
    wire = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (!isRecord(wire) || wire.v !== 1) return null;

  return {
    main: toCounts(MAIN_COUNT_KEYS, wire.m) as MainCounts,
    reasons: toReasons(wire.r),
    otherMethods: wire.o === 1,
    other: toCounts(OTHER_COUNT_KEYS, wire.oc) as OtherCounts,
    otherReasons: toReasons(wire.or),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/prismaUrlState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/tools/lib/prismaUrlState.ts apps/web/src/features/tools/lib/prismaUrlState.test.ts
git commit -m "feat(tools): save the PRISMA diagram in the URL hash (#459)"
```

---

### Task 3: Layout (`prismaLayout.ts`)

**Files:**
- Create: `apps/web/src/features/tools/lib/prismaLayout.ts`
- Test: `apps/web/src/features/tools/lib/prismaLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/prismaLayout.test.ts`
Expected: FAIL — `Failed to resolve import "./prismaLayout"`.

- [ ] **Step 3: Implement**

```ts
import { type ExclusionReason, formatCount, type PrismaFlowState, reasonLabel } from "./prismaFlow";

export const DIAGRAM_FONT = "Arial, Helvetica, sans-serif";
export const FONT_SIZE = 12;
export const LINE_HEIGHT = 16;
export const BOX_PADDING = 10;

const MARGIN = 16;
const PHASE_W = 30;
const PHASE_GAP = 16;
const BOX_W = 230;
const ARROW_GAP = 40;
const COLUMN_W = BOX_W * 2 + ARROW_GAP;
const COLUMN_GAP = 40;
const HEADER_H = 32;
const ROW_GAP = 28;
/** An average Arial glyph is about 0.53em: 6.4px a character at 12px keeps lines inside the box. */
const CHAR_W = 6.4;
const BOX_CHARS = Math.floor((BOX_W - BOX_PADDING * 2) / CHAR_W);
const HEADER_CHARS = Math.floor((COLUMN_W - BOX_PADDING * 2) / CHAR_W);

export type PrismaBox = {
  id: string;
  kind: "box" | "header" | "phase";
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
};

export type PrismaArrow = { id: string; points: [number, number][] };

export type PrismaLayout = {
  width: number;
  height: number;
  boxes: PrismaBox[];
  arrows: PrismaArrow[];
};

/** Greedy word wrap by character count; words longer than a line are split. */
export function wrapText(text: string, maxChars: number): string[] {
  const chunk = new RegExp(`.{1,${maxChars}}`, "gu");
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (word.length <= maxChars ? [word] : (word.match(chunk) ?? [])));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

type Cell = { id: string; lines: string[] };

const cell = (id: string, ...texts: string[]): Cell => ({
  id,
  lines: texts.flatMap((text) => wrapText(text, BOX_CHARS)),
});

const reasonsCell = (id: string, reasons: ExclusionReason[]) =>
  cell(
    id,
    "Reports excluded:",
    ...reasons.map((reason, i) => `${reasonLabel(reason, i)} ${formatCount(reason.count)}`)
  );

const boxHeight = (lines: number) => BOX_PADDING * 2 + lines * LINE_HEIGHT;

/** Geometry of the PRISMA 2020 flow diagram for new reviews, in SVG user units. */
export function layoutPrismaFlow(state: PrismaFlowState): PrismaLayout {
  const { main, other, otherMethods } = state;
  const o = otherMethods;

  // Columns: main box, its side box, then (other methods) the same pair again.
  const rows: (Cell | undefined)[][] = [
    [
      cell(
        "identified",
        "Records identified from:",
        `Databases ${formatCount(main.databases)}`,
        `Registers ${formatCount(main.registers)}`
      ),
      cell(
        "removed",
        "Records removed before screening:",
        `Duplicate records removed ${formatCount(main.duplicatesRemoved)}`,
        `Records marked as ineligible by automation tools ${formatCount(main.automationRemoved)}`,
        `Records removed for other reasons ${formatCount(main.otherRemoved)}`
      ),
      o
        ? cell(
            "other-identified",
            "Records identified from:",
            `Websites ${formatCount(other.websites)}`,
            `Organisations ${formatCount(other.organisations)}`,
            `Citation searching ${formatCount(other.citationSearching)}`
          )
        : undefined,
      undefined,
    ],
    [
      cell("screened", `Records screened ${formatCount(main.recordsScreened)}`),
      cell("excluded", `Records excluded ${formatCount(main.recordsExcluded)}`),
      undefined,
      undefined,
    ],
    [
      cell("sought", `Reports sought for retrieval ${formatCount(main.reportsSought)}`),
      cell("not-retrieved", `Reports not retrieved ${formatCount(main.reportsNotRetrieved)}`),
      o
        ? cell("other-sought", `Reports sought for retrieval ${formatCount(other.reportsSought)}`)
        : undefined,
      o
        ? cell(
            "other-not-retrieved",
            `Reports not retrieved ${formatCount(other.reportsNotRetrieved)}`
          )
        : undefined,
    ],
    [
      cell("assessed", `Reports assessed for eligibility ${formatCount(main.reportsAssessed)}`),
      reasonsCell("reports-excluded", state.reasons),
      o
        ? cell(
            "other-assessed",
            `Reports assessed for eligibility ${formatCount(other.reportsAssessed)}`
          )
        : undefined,
      o ? reasonsCell("other-reports-excluded", state.otherReasons) : undefined,
    ],
    [
      cell(
        "included",
        `Studies included in review ${formatCount(main.studiesIncluded)}`,
        `Reports of included studies ${formatCount(main.reportsIncluded)}`
      ),
      undefined,
      undefined,
      undefined,
    ],
  ];

  const mainX = MARGIN + PHASE_W + PHASE_GAP;
  const otherX = mainX + COLUMN_W + COLUMN_GAP;
  const columnXs = [mainX, mainX + BOX_W + ARROW_GAP, otherX, otherX + BOX_W + ARROW_GAP];
  const width = (o ? otherX : mainX) + COLUMN_W + MARGIN;

  const boxes: PrismaBox[] = [
    {
      id: "header-main",
      kind: "header",
      x: mainX,
      y: MARGIN,
      w: COLUMN_W,
      h: HEADER_H,
      lines: wrapText("Identification of studies via databases and registers", HEADER_CHARS),
    },
  ];
  if (o) {
    boxes.push({
      id: "header-other",
      kind: "header",
      x: otherX,
      y: MARGIN,
      w: COLUMN_W,
      h: HEADER_H,
      lines: wrapText("Identification of studies via other methods", HEADER_CHARS),
    });
  }

  const placed = new Map<string, PrismaBox>();
  const rowTops: number[] = [];
  const rowHeights: number[] = [];
  let y = MARGIN + HEADER_H + ROW_GAP;
  for (const row of rows) {
    const h = Math.max(...row.filter((c): c is Cell => c !== undefined).map((c) => boxHeight(c.lines.length)));
    row.forEach((c, column) => {
      if (!c) return;
      const box: PrismaBox = { id: c.id, kind: "box", x: columnXs[column]!, y, w: BOX_W, h, lines: c.lines };
      boxes.push(box);
      placed.set(c.id, box);
    });
    rowTops.push(y);
    rowHeights.push(h);
    y += h + ROW_GAP;
  }
  const height = y - ROW_GAP + MARGIN;

  const phase = (id: string, label: string, first: number, last: number) => {
    const top = rowTops[first]!;
    boxes.push({
      id,
      kind: "phase",
      x: MARGIN,
      y: top,
      w: PHASE_W,
      h: rowTops[last]! + rowHeights[last]! - top,
      lines: [label],
    });
  };
  phase("phase-identification", "Identification", 0, 0);
  phase("phase-screening", "Screening", 1, 3);
  phase("phase-included", "Included", 4, 4);

  const get = (id: string) => {
    const box = placed.get(id);
    if (!box) throw new Error(`PRISMA layout: no box ${id}`);
    return box;
  };
  const arrows: PrismaArrow[] = [];
  const down = (from: string, to: string) => {
    const a = get(from);
    const b = get(to);
    arrows.push({ id: `${from}-${to}`, points: [[a.x + a.w / 2, a.y + a.h], [b.x + b.w / 2, b.y]] });
  };
  const right = (from: string, to: string) => {
    const a = get(from);
    const b = get(to);
    arrows.push({ id: `${from}-${to}`, points: [[a.x + a.w, a.y + a.h / 2], [b.x, b.y + b.h / 2]] });
  };

  down("identified", "screened");
  down("screened", "sought");
  down("sought", "assessed");
  down("assessed", "included");
  right("identified", "removed");
  right("screened", "excluded");
  right("sought", "not-retrieved");
  right("assessed", "reports-excluded");
  if (o) {
    down("other-identified", "other-sought");
    down("other-sought", "other-assessed");
    right("other-sought", "other-not-retrieved");
    right("other-assessed", "other-reports-excluded");
    const from = get("other-assessed");
    const to = get("included");
    const midY = to.y + to.h / 2;
    arrows.push({
      id: "other-assessed-included",
      points: [
        [from.x + from.w / 2, from.y + from.h],
        [from.x + from.w / 2, midY],
        [to.x + to.w, midY],
      ],
    });
  }

  return { width, height, boxes, arrows };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/prismaLayout.test.ts`
Expected: PASS. If the `wrapText` expectation is off by one word, fix the test only if `BOX_CHARS` is 32 (`Math.floor(210 / 6.4)`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/tools/lib/prismaLayout.ts apps/web/src/features/tools/lib/prismaLayout.test.ts
git commit -m "feat(tools): PRISMA 2020 diagram layout and text wrapping (#459)"
```

---

### Task 4: SVG renderer and export (`PrismaDiagram.tsx`, `exportDiagram.ts`)

**Files:**
- Create: `apps/web/src/features/tools/components/PrismaDiagram.tsx`
- Create: `apps/web/src/features/tools/lib/exportDiagram.ts`
- Test: `apps/web/src/features/tools/lib/exportDiagram.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrismaDiagram } from "../components/PrismaDiagram";
import { createEmptyPrismaState } from "./prismaFlow";
import { serializeSvg } from "./exportDiagram";

describe("serializeSvg", () => {
  it("writes a standalone SVG with the counts and without page classes", () => {
    const state = createEmptyPrismaState();
    state.main.recordsScreened = 325;
    const { container } = render(<PrismaDiagram state={state} className="h-auto w-full" />);
    const svg = container.querySelector("svg")!;

    const text = serializeSvg(svg);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain("Records screened (n = 325)");
    expect(text).toContain('font-family="Arial, Helvetica, sans-serif"');
    expect(text).not.toContain("class=");
    expect(svg.getAttribute("class")).toBe("h-auto w-full");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/exportDiagram.test.tsx`
Expected: FAIL — cannot resolve `../components/PrismaDiagram`.

- [ ] **Step 3: Implement the renderer**

`apps/web/src/features/tools/components/PrismaDiagram.tsx`:

```tsx
import { type Ref, useMemo } from "react";
import type { PrismaFlowState } from "../lib/prismaFlow";
import {
  BOX_PADDING,
  DIAGRAM_FONT,
  FONT_SIZE,
  LINE_HEIGHT,
  layoutPrismaFlow,
  type PrismaBox,
} from "../lib/prismaLayout";

/** Manuscript colours: the figure stays black on white in every theme. */
const INK = "#000000";
const PAPER = "#ffffff";
const BAND = "#e6e6e6";

export const PRISMA_DIAGRAM_TITLE = "PRISMA 2020 flow diagram";

/** Stable keys for a box's lines without using their index. */
function keyedLines(boxId: string, lines: string[]) {
  const seen = new Map<string, number>();
  return lines.map((text) => {
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    return { key: `${boxId}:${text}:${n}`, text };
  });
}

function BoxText({ box }: { box: PrismaBox }) {
  if (box.kind === "phase") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return (
      <text
        x={cx}
        y={cy}
        transform={`rotate(-90 ${cx} ${cy})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="bold"
      >
        {box.lines[0]}
      </text>
    );
  }
  const centered = box.kind === "header";
  const top = centered
    ? box.y + (box.h - box.lines.length * LINE_HEIGHT) / 2
    : box.y + BOX_PADDING;
  const x = centered ? box.x + box.w / 2 : box.x + BOX_PADDING;
  return (
    <text textAnchor={centered ? "middle" : "start"} fontWeight={centered ? "bold" : undefined}>
      {keyedLines(box.id, box.lines).map((line, i) => (
        <tspan key={line.key} x={x} y={top + (i + 1) * LINE_HEIGHT - 4}>
          {line.text}
        </tspan>
      ))}
    </text>
  );
}

type PrismaDiagramProps = {
  state: PrismaFlowState;
  /** Page sizing only; stripped from downloads. */
  className?: string;
  ref?: Ref<SVGSVGElement>;
};

/** The diagram as one self-contained SVG: inline attributes only, so it exports as drawn. */
export function PrismaDiagram({ state, className, ref }: PrismaDiagramProps) {
  const layout = useMemo(() => layoutPrismaFlow(state), [state]);
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      fontFamily={DIAGRAM_FONT}
      fontSize={FONT_SIZE}
      fill={INK}
      role="img"
      aria-label={PRISMA_DIAGRAM_TITLE}
      className={className}
    >
      <title>{PRISMA_DIAGRAM_TITLE}</title>
      <defs>
        <marker
          id="prisma-arrowhead"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={INK} />
        </marker>
      </defs>
      <rect width={layout.width} height={layout.height} fill={PAPER} />
      {layout.boxes.map((box) => (
        <g key={box.id} data-box={box.id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={box.kind === "box" ? PAPER : BAND}
            stroke={box.kind === "box" ? INK : "none"}
            strokeWidth={1}
          />
          <BoxText box={box} />
        </g>
      ))}
      {layout.arrows.map((arrow) => (
        <polyline
          key={arrow.id}
          points={arrow.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={INK}
          strokeWidth={1}
          markerEnd="url(#prisma-arrowhead)"
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: Implement export**

`apps/web/src/features/tools/lib/exportDiagram.ts`:

```ts
import { downloadBlob } from "@/shared/utils/downloadFile";

const SVG_TYPE = "image/svg+xml;charset=utf-8";

/** A standalone SVG file: XML prolog, namespace, and no page-only class names. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export function downloadSvg(svg: SVGSVGElement, fileName: string): void {
  downloadBlob(new Blob([serializeSvg(svg)], { type: SVG_TYPE }), fileName);
}

/** Rasterizes the SVG on a white canvas at `scale`× its size. */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  const url = URL.createObjectURL(new Blob([serializeSvg(svg)], { type: SVG_TYPE }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Couldn't render the diagram"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))),
        "image/png"
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(svg: SVGSVGElement, fileName: string, scale = 2): Promise<void> {
  downloadBlob(await svgToPngBlob(svg, scale), fileName);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/exportDiagram.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/tools/components/PrismaDiagram.tsx apps/web/src/features/tools/lib/exportDiagram.ts apps/web/src/features/tools/lib/exportDiagram.test.tsx
git commit -m "feat(tools): render the PRISMA diagram as SVG and export SVG/PNG (#459)"
```

---

### Task 5: The form (`PrismaForm.tsx`)

**Files:**
- Create: `apps/web/src/features/tools/components/PrismaForm.tsx`
- Test: `apps/web/src/features/tools/components/PrismaForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { checkPrismaCounts, createEmptyPrismaState, MAX_REASONS } from "../lib/prismaFlow";
import { PrismaDiagram } from "./PrismaDiagram";
import { PrismaForm } from "./PrismaForm";

function Harness() {
  const [state, setState] = useState(createEmptyPrismaState);
  return (
    <>
      <PrismaForm state={state} warnings={checkPrismaCounts(state)} onChange={setState} />
      <PrismaDiagram state={state} />
    </>
  );
}

const diagramText = () => document.querySelector("svg")!.textContent;

describe("PrismaForm", () => {
  it("draws typed counts and ignores non-digits", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Records screened"), "3a25");
    expect(screen.getByLabelText("Records screened")).toHaveValue("325");
    expect(diagramText()).toContain("Records screened (n = 325)");
  });

  it("shows a warning next to a count that doesn't add up", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Records from databases"), "100");
    await user.type(screen.getByLabelText("Records screened"), "90");
    expect(
      screen.getByText("Identified 100 − removed 0 = 100, but records screened is 90.")
    ).toBeInTheDocument();
  });

  it("names, adds and removes exclusion reasons", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Reason 1"), "Wrong population");
    await user.type(screen.getByLabelText("Reason 1 count"), "12");
    expect(diagramText()).toContain("Wrong population (n = 12)");

    await user.click(screen.getByRole("button", { name: "Remove reason 3" }));
    expect(screen.queryByLabelText("Reason 3")).not.toBeInTheDocument();

    const add = screen.getByRole("button", { name: "Add reason" });
    for (let i = 2; i < MAX_REASONS; i++) await user.click(add);
    expect(add).toBeDisabled();
  });

  it("adds the other-methods fields and column", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(diagramText()).not.toContain("Identification of studies via other methods");
    await user.click(
      screen.getByRole("switch", { name: "Include other methods (websites, citation searching)" })
    );
    const other = screen.getByRole("group", { name: "Other methods" });
    await user.type(within(other).getByLabelText("Records from citation searching"), "9");
    expect(diagramText()).toContain("Identification of studies via other methods");
    expect(diagramText()).toContain("Citation searching (n = 9)");
    expect(within(other).getByLabelText("Other methods reason 1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/tools/components/PrismaForm.test.tsx`
Expected: FAIL — cannot resolve `./PrismaForm`.

- [ ] **Step 3: Implement**

```tsx
import { Plus, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  type Count,
  type ExclusionReason,
  MAX_REASON_LABEL,
  MAX_REASONS,
  type MainCounts,
  newReason,
  type OtherCounts,
  type PrismaFlowState,
  type PrismaWarning,
  parseCount,
} from "../lib/prismaFlow";

type FieldDef<K> = { key: K; label: string };

const IDENTIFICATION_FIELDS: FieldDef<keyof MainCounts>[] = [
  { key: "databases", label: "Records from databases" },
  { key: "registers", label: "Records from registers" },
  { key: "duplicatesRemoved", label: "Duplicate records removed" },
  { key: "automationRemoved", label: "Marked ineligible by automation tools" },
  { key: "otherRemoved", label: "Removed for other reasons" },
];

const SCREENING_FIELDS: FieldDef<keyof MainCounts>[] = [
  { key: "recordsScreened", label: "Records screened" },
  { key: "recordsExcluded", label: "Records excluded" },
  { key: "reportsSought", label: "Reports sought for retrieval" },
  { key: "reportsNotRetrieved", label: "Reports not retrieved" },
  { key: "reportsAssessed", label: "Reports assessed for eligibility" },
];

const INCLUDED_FIELDS: FieldDef<keyof MainCounts>[] = [
  { key: "studiesIncluded", label: "Studies included in review" },
  { key: "reportsIncluded", label: "Reports of included studies" },
];

const OTHER_FIELDS: FieldDef<keyof OtherCounts>[] = [
  { key: "websites", label: "Records from websites" },
  { key: "organisations", label: "Records from organisations" },
  { key: "citationSearching", label: "Records from citation searching" },
  { key: "reportsSought", label: "Reports sought for retrieval" },
  { key: "reportsNotRetrieved", label: "Reports not retrieved" },
  { key: "reportsAssessed", label: "Reports assessed for eligibility" },
];

type CountFieldProps = {
  id: string;
  label: string;
  value: Count;
  onChange: (value: Count) => void;
  warning?: string;
};

function CountField({ id, label, value, onChange, warning }: CountFieldProps) {
  const warningId = `${id}-warning`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="n"
        value={value ?? ""}
        onChange={(event) => onChange(parseCount(event.target.value))}
        aria-describedby={warning ? warningId : undefined}
      />
      {warning ? (
        <p id={warningId} className="text-sm text-warning-muted-foreground">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

type ReasonsEditorProps = {
  /** Prefixes accessible names so the two columns' rows stay distinct ("Other methods reason 1"). */
  namePrefix?: string;
  reasons: ExclusionReason[];
  onChange: (reasons: ExclusionReason[]) => void;
};

function ReasonsEditor({ namePrefix, reasons, onChange }: ReasonsEditorProps) {
  const name = (index: number) =>
    namePrefix ? `${namePrefix} reason ${index + 1}` : `Reason ${index + 1}`;
  const update = (id: string, patch: Partial<ExclusionReason>) =>
    onChange(reasons.map((reason) => (reason.id === id ? { ...reason, ...patch } : reason)));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Reports excluded, with reasons</p>
      {reasons.map((reason, index) => (
        <div key={reason.id} className="flex items-center gap-2">
          <Input
            aria-label={name(index)}
            placeholder={`Reason ${index + 1}`}
            maxLength={MAX_REASON_LABEL}
            value={reason.label}
            onChange={(event) => update(reason.id, { label: event.target.value })}
          />
          <Input
            aria-label={`${name(index)} count`}
            className="w-24 shrink-0"
            inputMode="numeric"
            autoComplete="off"
            placeholder="n"
            value={reason.count ?? ""}
            onChange={(event) => update(reason.id, { count: parseCount(event.target.value) })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${name(index).toLowerCase()}`}
            onClick={() => onChange(reasons.filter((r) => r.id !== reason.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={reasons.length >= MAX_REASONS}
        onClick={() => onChange([...reasons, newReason()])}
      >
        <Plus /> Add reason
      </Button>
    </div>
  );
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-lg font-semibold text-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

type PrismaFormProps = {
  state: PrismaFlowState;
  warnings: PrismaWarning[];
  onChange: (state: PrismaFlowState) => void;
};

export function PrismaForm({ state, warnings, onChange }: PrismaFormProps) {
  const warningFor = (field: string) => warnings.find((w) => w.field === field)?.message;
  const setMain = (key: keyof MainCounts, value: Count) =>
    onChange({ ...state, main: { ...state.main, [key]: value } });
  const setOther = (key: keyof OtherCounts, value: Count) =>
    onChange({ ...state, other: { ...state.other, [key]: value } });

  const mainFields = (fields: FieldDef<keyof MainCounts>[]) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(({ key, label }) => (
        <CountField
          key={key}
          id={`prisma-${key}`}
          label={label}
          value={state.main[key]}
          onChange={(value) => setMain(key, value)}
          warning={warningFor(key)}
        />
      ))}
    </div>
  );

  return (
    <form className="space-y-8" aria-label="PRISMA counts" onSubmit={(e) => e.preventDefault()}>
      <Group legend="Identification">{mainFields(IDENTIFICATION_FIELDS)}</Group>
      <Group legend="Screening">
        {mainFields(SCREENING_FIELDS)}
        <ReasonsEditor
          reasons={state.reasons}
          onChange={(reasons) => onChange({ ...state, reasons })}
        />
      </Group>

      <div className="flex items-center gap-3">
        <Switch
          id="prisma-other-methods"
          checked={state.otherMethods}
          onCheckedChange={(otherMethods) => onChange({ ...state, otherMethods })}
        />
        <Label htmlFor="prisma-other-methods">
          Include other methods (websites, citation searching)
        </Label>
      </div>
      {state.otherMethods ? (
        <Group legend="Other methods">
          <div className="grid gap-4 sm:grid-cols-2">
            {OTHER_FIELDS.map(({ key, label }) => (
              <CountField
                key={key}
                id={`prisma-other-${key}`}
                label={label}
                value={state.other[key]}
                onChange={(value) => setOther(key, value)}
                warning={key === "reportsAssessed" ? warningFor("otherReportsAssessed") : undefined}
              />
            ))}
          </div>
          <ReasonsEditor
            namePrefix="Other methods"
            reasons={state.otherReasons}
            onChange={(otherReasons) => onChange({ ...state, otherReasons })}
          />
        </Group>
      ) : null}

      <Group legend="Included">{mainFields(INCLUDED_FIELDS)}</Group>
    </form>
  );
}
```

Note: the main column's remove buttons are named "Remove reason 3"; the other column's "Remove other methods reason 3".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/tools/components/PrismaForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/tools/components/PrismaForm.tsx apps/web/src/features/tools/components/PrismaForm.test.tsx
git commit -m "feat(tools): PRISMA count form with reasons and other methods (#459)"
```

---

### Task 6: Shared tool page chrome

Extract the flashcards page's header and article so both tool pages share them. No behaviour change.

**Files:**
- Create: `apps/web/src/features/tools/components/ToolPageChrome.tsx`
- Modify: `apps/web/src/features/tools/pages/PdfToFlashcardsPage.tsx` (header block lines 166–188, article lines 279–327)

- [ ] **Step 1: Create the shared components**

```tsx
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import type { ToolPageConfig } from "../toolPages";

type ToolHeaderProps = { isAuthenticated: boolean; onSignIn: () => void };

/** Sticky logo bar for a free tool page. */
export function ToolHeader({ isAuthenticated, onSignIn }: ToolHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-12">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <img src="/SolomindLM_logo.png" alt="SolomindLM" className="h-8 w-8 shrink-0 object-contain" />
          <span className="font-display text-lg font-bold tracking-tight text-foreground">
            SolomindLM
          </span>
        </Link>
        {isAuthenticated ? (
          <Button variant="ghost" asChild>
            <Link to="/home">Open SolomindLM</Link>
          </Button>
        ) : (
          <Button variant="ghost" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}

/** How it works, explainer sections, FAQ and related links from a tool's page config. */
export function ToolArticle({ page }: { page: ToolPageConfig }) {
  return (
    <article className="mx-auto mt-20 max-w-3xl space-y-12">
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="font-display text-2xl font-bold text-foreground">
          How it works
        </h2>
        <ol className="mt-4 space-y-3">
          {page.steps.map((step, i) => (
            <li key={step.name} className="text-foreground">
              <span className="font-semibold">
                {i + 1}. {step.name}.
              </span>{" "}
              <span className="text-muted-foreground">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2 className="font-display text-2xl font-bold text-foreground">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p} className="mt-3 leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="font-display text-2xl font-bold text-foreground">
          Frequently asked questions
        </h2>
        <dl className="mt-4 space-y-5">
          {page.faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold text-foreground">{faq.question}</dt>
              <dd className="mt-1 text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
      <nav aria-label="Related" className="flex flex-wrap gap-3">
        {page.related.map((link) => (
          <Button key={link.path} variant="outline" asChild>
            <Link to={link.path}>{link.label}</Link>
          </Button>
        ))}
      </nav>
    </article>
  );
}
```

- [ ] **Step 2: Use them in `PdfToFlashcardsPage.tsx`**

Replace the `<header>…</header>` block with:

```tsx
        <ToolHeader isAuthenticated={isAuthenticated} onSignIn={() => setAuthOpen(true)} />
```

Replace the `<article>…</article>` block with:

```tsx
          <ToolArticle page={PAGE} />
```

Add `import { ToolArticle, ToolHeader } from "../components/ToolPageChrome";`. Remove the `Link` import only if nothing else uses it (the error alert does not; check before removing).

- [ ] **Step 3: Verify nothing changed**

Run: `bun run --cwd apps/web test -- src/features/tools src/shared/seo` and `bun run typecheck:web`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/tools/components/ToolPageChrome.tsx apps/web/src/features/tools/pages/PdfToFlashcardsPage.tsx
git commit -m "refactor(tools): share the free tool page header and article (#459)"
```

---

### Task 7: Page config, page and route

**Files:**
- Modify: `apps/web/src/features/tools/toolPages.ts` (after `PDF_TO_FLASHCARDS_PAGE`, and `FREE_TOOL_PAGES`)
- Create: `apps/web/src/features/tools/pages/PrismaFlowDiagramPage.tsx`
- Modify: `apps/web/src/shell/publicRoutes.tsx:26,48-55`
- Test: `apps/web/src/shared/seo/seoHtml.test.ts` (free tool pages block), `apps/web/src/shell/isPublicPath.test.ts` (already iterates `FREE_TOOL_PAGES`)

- [ ] **Step 1: Write the failing SEO test**

Add to the `describe("free tool pages", …)` block in `seoHtml.test.ts`, importing `PRISMA_FLOW_DIAGRAM_PAGE` beside `PDF_TO_FLASHCARDS_PAGE`:

```ts
  it("registers and prerenders the PRISMA flow-diagram tool", () => {
    const page = getPublicSeoPageByPath(PRISMA_FLOW_DIAGRAM_PAGE.path);
    expect(page?.title).toBe(PRISMA_FLOW_DIAGRAM_PAGE.title);
    const body = buildPublicSeoPrerenderBody(PRISMA_FLOW_DIAGRAM_PAGE.path);
    expect(body).toContain(`<h1>${PRISMA_FLOW_DIAGRAM_PAGE.h1}</h1>`);
    expect(body).toContain('href="/research/ai-literature-review"');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --cwd apps/web test -- src/shared/seo/seoHtml.test.ts`
Expected: FAIL — `PRISMA_FLOW_DIAGRAM_PAGE` is not exported.

- [ ] **Step 3: Add the page config**

In `toolPages.ts`, after `PDF_TO_FLASHCARDS_PAGE`:

```ts
export const PRISMA_FLOW_DIAGRAM_PAGE: ToolPageConfig = {
  path: "/tools/prisma-flow-diagram",
  navLabel: "PRISMA flow diagram",
  title: "Free PRISMA 2020 Flow Diagram Generator — No Signup, SVG & PNG | SolomindLM",
  description:
    "Make a PRISMA 2020 flow diagram for your systematic review in the browser. Type your counts, check the arithmetic, and download SVG or PNG. Free, no account.",
  keywords:
    "prisma flow diagram generator, prisma 2020 flow diagram, prisma diagram maker, prisma flowchart, systematic review flow diagram, prisma template",
  h1: "Free PRISMA 2020 Flow Diagram Generator",
  intro:
    "Type the counts from your search and screening, and the diagram draws itself in the PRISMA 2020 layout. Download it as SVG or PNG for your manuscript. Free, no account, nothing uploaded.",
  steps: [
    {
      name: "Enter what your searches found",
      text: "Add the records from databases and registers, and the duplicates and other records you removed before screening.",
    },
    {
      name: "Add screening and eligibility",
      text: "Fill in records screened and excluded, reports sought, not retrieved and assessed, and name each reason for excluding reports.",
    },
    {
      name: "Check the warnings",
      text: "If a box doesn't add up, a note under the field shows the arithmetic. The diagram always draws exactly what you typed.",
    },
    {
      name: "Download or share",
      text: "Download an SVG for print or a PNG for slides, or copy a link that reopens your diagram.",
    },
  ],
  sections: [
    {
      heading: "What goes in each box",
      paragraphs: [
        "Identification counts the records your searches returned and the records removed before screening: duplicates, records an automation tool marked ineligible, and records removed for other reasons.",
        "Screening follows records through title and abstract screening, then reports through full-text retrieval and eligibility assessment. Every report you exclude at eligibility needs a reason. Included gives the number of studies in the review and the reports of those studies.",
      ],
    },
    {
      heading: "Databases and registers, or other methods too",
      paragraphs: [
        "Switch on other methods if you also found studies through websites, organisations or citation searching. The diagram adds a second column for them, and both columns feed the same Included box.",
      ],
    },
    {
      heading: "PRISMA 2020 versus PRISMA 2009",
      paragraphs: [
        "PRISMA 2020 separates records (titles and abstracts) from reports (full-text documents), adds study registers, adds the optional other-methods column, and asks for the records removed before screening by type. If your journal still asks for the 2009 diagram, check its author instructions.",
      ],
    },
    {
      heading: "Using the diagram in your manuscript",
      paragraphs: [
        "SVG stays sharp at any size and opens in Word, PowerPoint, Inkscape and Illustrator. PNG is exported at twice the on-screen size. Cite the template as Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71.",
        "The diagram is a reporting aid: drawing it doesn't make a review follow the PRISMA statement. Report the full checklist alongside it.",
      ],
    },
  ],
  faqs: [
    {
      question: "Is this PRISMA flow diagram generator free?",
      answer: "Yes. Make and download as many diagrams as you like. No account, no watermark.",
    },
    {
      question: "Are my numbers uploaded?",
      answer:
        "No. The diagram is drawn in your browser. Your counts are kept in the part of the link after #, which browsers never send to a server.",
    },
    {
      question: "Which PRISMA template does it use?",
      answer:
        "The PRISMA 2020 flow diagram for new systematic reviews, with databases and registers only or with other methods as well. The templates for updated reviews are not supported yet.",
    },
    {
      question: "Can I edit the diagram after downloading it?",
      answer:
        "Yes. The SVG keeps every box and line as an editable shape in Inkscape, Illustrator or PowerPoint. To change a count, it is usually quicker to reopen your link and download again.",
    },
    {
      question: "How do I cite the PRISMA 2020 template?",
      answer:
        "Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71. The template is licensed CC BY 4.0.",
    },
    {
      question: "Why does a box show a warning?",
      answer:
        "Its count doesn't match the arithmetic of the boxes above it, for example records screened should equal records identified minus records removed. The warning is a check, not a block: fix the number or leave it if your review counted differently.",
    },
  ],
  related: [
    { path: "/research/ai-literature-review", label: "AI literature review with screening" },
    { path: "/research/academic-paper-discovery", label: "Find papers for your review" },
    { path: "/compare", label: "Compare research tools" },
  ],
};

export const FREE_TOOL_PAGES: ToolPageConfig[] = [PDF_TO_FLASHCARDS_PAGE, PRISMA_FLOW_DIAGRAM_PAGE];
```

(Replace the existing `FREE_TOOL_PAGES` line.)

- [ ] **Step 4: Run the SEO test to verify it passes**

Run: `bun run --cwd apps/web test -- src/shared/seo/seoHtml.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the public-path test now fails**

Run: `bun run --cwd apps/web test -- src/shell/isPublicPath.test.ts`
Expected: FAIL — `/tools/prisma-flow-diagram` is not public yet.

- [ ] **Step 6: Create the page**

`apps/web/src/features/tools/pages/PrismaFlowDiagramPage.tsx`:

```tsx
import { Download, Link2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Footer } from "@/features/landing/components/Footer";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/contexts/useToast";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { PrismaDiagram } from "../components/PrismaDiagram";
import { PrismaForm } from "../components/PrismaForm";
import { ToolArticle, ToolHeader } from "../components/ToolPageChrome";
import { downloadPng, downloadSvg } from "../lib/exportDiagram";
import {
  checkPrismaCounts,
  createEmptyPrismaState,
  isPrismaStateEmpty,
  type PrismaFlowState,
} from "../lib/prismaFlow";
import { decodePrismaState, encodePrismaState } from "../lib/prismaUrlState";
import { PRISMA_FLOW_DIAGRAM_PAGE as PAGE } from "../toolPages";

const FILE_NAME = "prisma-2020-flow-diagram";
const HASH_WRITE_DELAY_MS = 300;

const hashFor = (state: PrismaFlowState) =>
  isPrismaStateEmpty(state) ? "" : `#${encodePrismaState(state)}`;

export default function PrismaFlowDiagramPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [state, setState] = useState<PrismaFlowState>(
    () => decodePrismaState(window.location.hash) ?? createEmptyPrismaState()
  );
  const [authOpen, setAuthOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const toast = useToast();
  const warnings = useMemo(() => checkPrismaCounts(state), [state]);

  // Keep the diagram in the URL so a reload or a shared link reopens it.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { pathname, search, hash } = window.location;
      const next = hashFor(state);
      if (next !== hash) window.history.replaceState(window.history.state, "", `${pathname}${search}${next}`);
    }, HASH_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (isNativeShell()) {
    if (isLoading) return <div className="min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const exportSvg = () => {
    if (svgRef.current) downloadSvg(svgRef.current, `${FILE_NAME}.svg`);
  };

  const exportPng = async () => {
    if (!svgRef.current) return;
    try {
      await downloadPng(svgRef.current, `${FILE_NAME}.png`);
    } catch {
      toast.error("Couldn't make the PNG. Download the SVG instead.");
    }
  };

  const copyLink = async () => {
    const { origin, pathname } = window.location;
    try {
      await navigator.clipboard.writeText(`${origin}${pathname}${hashFor(state)}`);
      toast.success("Link copied. It reopens this diagram.");
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar instead.");
    }
  };

  return (
    <>
      <SEOMeta
        pagePath={PAGE.path}
        title={PAGE.title}
        description={PAGE.description}
        keywords={PAGE.keywords}
      />
      <div className="min-h-screen landing-grid-pattern">
        <ToolHeader isAuthenticated={isAuthenticated} onSignIn={() => setAuthOpen(true)} />

        <main className="px-4 pb-20 sm:px-6">
          <section className="mx-auto max-w-3xl space-y-4 pt-14 text-center md:pt-20">
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              {PAGE.h1}
            </h1>
            <p className="text-lg text-muted-foreground">{PAGE.intro}</p>
          </section>

          <div className="mx-auto mt-10 grid max-w-7xl items-start gap-6 lg:grid-cols-5">
            <section
              aria-label="Counts"
              className="rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline sm:p-8 lg:col-span-2"
            >
              <PrismaForm state={state} warnings={warnings} onChange={setState} />
            </section>

            <section
              aria-labelledby="diagram-heading"
              className="min-w-0 space-y-4 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline lg:sticky lg:top-24 lg:col-span-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="diagram-heading" className="font-display text-xl font-bold text-foreground">
                  Your diagram
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={exportSvg}>
                    <Download /> Download SVG
                  </Button>
                  <Button variant="secondary" onClick={exportPng}>
                    <Download /> Download PNG
                  </Button>
                  <Button variant="outline" onClick={copyLink}>
                    <Link2 /> Copy link
                  </Button>
                  <Button variant="ghost" onClick={() => setState(createEmptyPrismaState())}>
                    <RotateCcw /> Reset
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg ring-1 ring-hairline">
                <PrismaDiagram ref={svgRef} state={state} className="h-auto w-full min-w-xl" />
              </div>
              <p className="text-xs text-muted-foreground">
                Template:{" "}
                <a
                  href="https://www.prisma-statement.org/prisma-2020-flow-diagram"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  PRISMA 2020
                </a>{" "}
                (Page MJ et al., BMJ 2021;372:n71), CC BY 4.0.
              </p>
            </section>
          </div>

          <section className="mx-auto mt-10 max-w-3xl rounded-2xl bg-card p-6 text-center shadow-xs ring-1 ring-hairline">
            <p className="font-display text-lg text-foreground">Let the review do the counting</p>
            <p className="mt-1 text-sm text-muted-foreground">
              SolomindLM's literature review searches academic databases, removes duplicates, screens
              papers against your criteria and shows the count at every step.
            </p>
            {isAuthenticated ? (
              <Button className="mt-4" asChild>
                <Link to="/home">Open SolomindLM</Link>
              </Button>
            ) : (
              <Button className="mt-4" onClick={() => setAuthOpen(true)}>
                Try the literature review free
              </Button>
            )}
          </section>

          <ToolArticle page={PAGE} />
        </main>
        <Footer />
      </div>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => setAuthOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 7: Add the route**

In `apps/web/src/shell/publicRoutes.tsx`, beside the flashcards lazy import:

```tsx
const PrismaFlowDiagramPage = lazy(() => import("@/features/tools/pages/PrismaFlowDiagramPage"));
```

and after the `/tools/pdf-to-flashcards` route object:

```tsx
  {
    path: "/tools/prisma-flow-diagram",
    element: (
      <Suspense fallback={pageFallback}>
        <PrismaFlowDiagramPage />
      </Suspense>
    ),
  },
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `bun run --cwd apps/web test -- src/shell src/shared/seo src/features/tools` then `bun run typecheck:web`
Expected: PASS; no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/tools/toolPages.ts apps/web/src/features/tools/pages/PrismaFlowDiagramPage.tsx apps/web/src/shell/publicRoutes.tsx apps/web/src/shared/seo/seoHtml.test.ts
git commit -m "feat(tools): free PRISMA flow-diagram page at /tools/prisma-flow-diagram (#459)"
```

---

### Task 8: Discovery and cross-links

**Files:**
- Modify: `apps/web/src/features/landing/intentLandingPages.ts` (the `/research/ai-literature-review` entry)
- Modify: `apps/web/src/shared/seo/seoHtml.test.ts`
- Modify: `apps/web/public/sitemap.xml` (after the flashcards `<url>`), `apps/web/public/llms.txt` (Free tools list)

- [ ] **Step 1: Write the failing cross-link test**

In the `describe("free tool pages", …)` block:

```ts
  it("cross-links the literature review intent page to the PRISMA tool", () => {
    const intentPage = getIntentLandingPageByPath("/research/ai-literature-review");
    const body = buildIntentLandingPrerenderBody(intentPage!);
    expect(body).toContain(
      `<a href="${PRISMA_FLOW_DIAGRAM_PAGE.path}">Free PRISMA flow diagram generator</a>`
    );
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --cwd apps/web test -- src/shared/seo/seoHtml.test.ts`
Expected: FAIL — the link is missing.

- [ ] **Step 3: Add the cross-link**

In the `/research/ai-literature-review` entry, after `sourceToOutput`:

```ts
    heroCrossLink: {
      path: "/tools/prisma-flow-diagram",
      label: "Need a PRISMA diagram?",
      description:
        "Draw a PRISMA 2020 flow diagram from your counts and download it as SVG or PNG, no account needed.",
      linkLabel: "Free PRISMA flow diagram generator",
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --cwd apps/web test -- src/shared/seo/seoHtml.test.ts`
Expected: PASS.

- [ ] **Step 5: Sitemap and llms.txt**

`sitemap.xml`, after the flashcards `<url>` block:

```xml
  <url>
    <loc>https://www.solomindlm.com/tools/prisma-flow-diagram</loc>
    <lastmod>2026-10-09</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>

```

`llms.txt`, under `### Free tools`:

```
- Free PRISMA 2020 flow diagram generator (no signup; SVG and PNG export, other-methods column): https://www.solomindlm.com/tools/prisma-flow-diagram
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/landing/intentLandingPages.ts apps/web/src/shared/seo/seoHtml.test.ts apps/web/public/sitemap.xml apps/web/public/llms.txt
git commit -m "feat(seo): list the PRISMA tool and link it from the literature review page (#459)"
```

---

### Task 9: End-to-end and CSP

**Files:**
- Create: `e2e/tools/prisma-flow-diagram.spec.ts`
- Modify: `e2e/csp/csp.spec.ts:21`

- [ ] **Step 1: Write the E2E spec**

```ts
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// A free tool for visitors without an account.
test.use({ storageState: { cookies: [], origins: [] } });

test("type counts → diagram → SVG download → link restores it", async ({ page }) => {
  await page.goto("/tools/prisma-flow-diagram");
  await expect(
    page.getByRole("heading", { level: 1, name: "Free PRISMA 2020 Flow Diagram Generator" })
  ).toBeVisible();

  await page.getByLabel("Records from databases").fill("412");
  await page.getByLabel("Duplicate records removed").fill("87");
  await page.getByLabel("Records screened").fill("320");
  await expect(
    page.getByText("Identified 412 − removed 87 = 325, but records screened is 320.")
  ).toBeVisible();
  await page.getByLabel("Records screened").fill("325");
  await page.getByLabel("Reason 1", { exact: true }).fill("Wrong population");
  await page.getByLabel("Reason 1 count").fill("12");

  const diagram = page.getByRole("img", { name: "PRISMA 2020 flow diagram" });
  await expect(diagram).toContainText("Records screened (n = 325)");
  await expect(diagram).toContainText("Wrong population (n = 12)");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download SVG" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("prisma-2020-flow-diagram.svg");
  const svg = await readFile((await download.path())!, "utf-8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("Records screened (n = 325)");

  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toBe("prisma-2020-flow-diagram.png");

  await expect(page).toHaveURL(/#d=/);
  await page.reload();
  await expect(page.getByLabel("Records screened")).toHaveValue("325");
  await expect(page.getByRole("img", { name: "PRISMA 2020 flow diagram" })).toContainText(
    "Wrong population (n = 12)"
  );
});
```

- [ ] **Step 2: Add the page to the CSP spec**

`e2e/csp/csp.spec.ts` line 21:

```ts
const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/faq",
  "/privacy",
  "/tools/pdf-to-flashcards",
  "/tools/prisma-flow-diagram",
];
```

- [ ] **Step 3: Run the E2E specs**

Run: `bun run test:e2e -- e2e/tools/prisma-flow-diagram.spec.ts e2e/csp/csp.spec.ts`
Expected: PASS. If the local e2e environment can't start, record that and rely on CI.

- [ ] **Step 4: Commit**

```bash
git add e2e/tools/prisma-flow-diagram.spec.ts e2e/csp/csp.spec.ts
git commit -m "test(e2e): PRISMA flow-diagram tool and its CSP (#459)"
```

---

### Task 10: Verification and PR

- [ ] **Step 1: Validation gates**

Run in order: `bun run typecheck:web`, `bun run typecheck:convex`, `bun run lint`, `bun run lint:design`, `bun run test:web`.
Expected: all pass; `lint:design` count does not go up.

- [ ] **Step 2: Browser check**

Start the web dev server (`.claude/launch.json` web entry), open `/tools/prisma-flow-diagram`: fill counts, toggle other methods, download SVG and PNG, reload with the hash. Screenshot light, dark and 390px wide.

- [ ] **Step 3: Open the PR**

Branch `feature/459-prisma-flow-diagram-tool` → `main`, title `feat(tools): free PRISMA 2020 flow-diagram generator (#459)`, body linking #459 and #486, with screenshots and the test plan.
