import { describe, expect, it } from "vitest";
import { createEmptyPrismaState, MAX_COUNT, MAX_REASONS, type PrismaFlowState } from "./prismaFlow";
import { decodePrismaState, encodePrismaState, hasPrismaHash } from "./prismaUrlState";

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

  it("tells a diagram hash, even a broken one, from an in-page anchor", () => {
    expect(hasPrismaHash(`#${encodePrismaState(createEmptyPrismaState())}`)).toBe(true);
    expect(hasPrismaHash("#d=not*base64")).toBe(true);
    expect(hasPrismaHash("#faq-heading")).toBe(false);
    expect(hasPrismaHash("")).toBe(false);
  });

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
