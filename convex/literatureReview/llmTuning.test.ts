import { describe, expect, it } from "vitest";
import { truncateForLiteratureLlm } from "./llmTuning";

describe("truncateForLiteratureLlm", () => {
  it("leaves short text unchanged", () => {
    expect(truncateForLiteratureLlm("hello")).toBe("hello");
  });

  it("truncates long abstracts", () => {
    const long = "a".repeat(2000);
    const out = truncateForLiteratureLlm(long, 100);
    expect(out.length).toBe(101);
    expect(out.endsWith("…")).toBe(true);
  });
});
