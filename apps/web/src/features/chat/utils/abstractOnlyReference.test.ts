import { describe, expect, it } from "vitest";
import type { Source } from "@/shared/types";
import { isAbstractOnlyReference } from "./abstractOnlyReference";

const source = (id: string, ingestionStatus?: "ingested" | "metadata_only"): Source => ({
  id,
  title: id,
  type: "PAPER",
  date: "",
  selected: true,
  paper: ingestionStatus ? { ingestionStatus } : undefined,
});

describe("isAbstractOnlyReference", () => {
  const sources = [source("a", "metadata_only"), source("b", "ingested"), source("c")];

  it("is true only for a cited notebook paper that holds just its abstract", () => {
    expect(isAbstractOnlyReference({ documentId: "a" }, sources)).toBe(true);
    expect(isAbstractOnlyReference({ documentId: "b" }, sources)).toBe(false);
    expect(isAbstractOnlyReference({ documentId: "c" }, sources)).toBe(false);
    expect(isAbstractOnlyReference({ documentId: "zzz" }, sources)).toBe(false);
    expect(isAbstractOnlyReference({}, sources)).toBe(false);
  });
});
