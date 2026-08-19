import { describe, expect, test } from "vitest";
import { findSmartModelById } from "./models";

describe("findSmartModelById", () => {
  test("returns catalog entry for a known model id", () => {
    expect(findSmartModelById("deepseek-ai/DeepSeek-V4-Flash-0731")?.id).toBe(
      "deepseek-ai/DeepSeek-V4-Flash-0731"
    );
  });

  test("returns undefined for unknown model ids", () => {
    expect(findSmartModelById("deepseek-ai/DeepSeek-V4-Pro")).toBeUndefined();
    expect(findSmartModelById(undefined)).toBeUndefined();
  });
});
