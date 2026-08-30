import { describe, expect, test } from "vitest";
import { resolveSmartModel } from "./resolveSmartModel";

describe("resolveSmartModel", () => {
  test("returns whitelisted model id when valid", () => {
    expect(resolveSmartModel("deepseek-ai/DeepSeek-V4-Flash-0731")).toBe(
      "deepseek-ai/DeepSeek-V4-Flash-0731"
    );
    expect(resolveSmartModel("zai-org/GLM-5.3-Flash")).toBe("zai-org/GLM-5.3-Flash");
  });

  test("falls back to default for unknown model", () => {
    expect(resolveSmartModel("not-a-real-model")).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
    expect(resolveSmartModel("deepseek-ai/DeepSeek-V4-Pro")).toBe(
      "deepseek-ai/DeepSeek-V4-Flash-0731"
    );
    expect(resolveSmartModel("zai-org/GLM-5.2")).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
  });

  test("falls back when candidate is empty", () => {
    expect(resolveSmartModel(undefined)).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
    expect(resolveSmartModel(null)).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
  });
});
