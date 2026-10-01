import { describe, expect, it } from "vitest";
import { resolveUseCaseIds } from "./ids";

const known = ["a", "b"];
const needsValue = "--use-case needs a value: <ids,comma-separated> or all";

describe("resolveUseCaseIds", () => {
  it("splits, trims and drops empty entries", () => {
    expect(resolveUseCaseIds(" a, b ,", known)).toEqual(["a", "b"]);
  });

  it("expands 'all' to every known id", () => {
    expect(resolveUseCaseIds("all", known)).toEqual(known);
  });

  it("rejects a missing, empty, or flag-like value", () => {
    expect(() => resolveUseCaseIds(undefined, known)).toThrow(needsValue);
    expect(() => resolveUseCaseIds("", known)).toThrow(needsValue);
    expect(() => resolveUseCaseIds(",", known)).toThrow(needsValue);
    expect(() => resolveUseCaseIds("--dry-run", known)).toThrow(needsValue);
  });
});
