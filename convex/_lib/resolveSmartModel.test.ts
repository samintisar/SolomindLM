import { describe, expect, test } from "vitest";
import { resolveSmartModel } from "./resolveSmartModel";

describe("resolveSmartModel", () => {
  test("returns whitelisted model id when valid", () => {
    expect(resolveSmartModel("deepseek-ai/DeepSeek-V4-Flash-0731")).toBe(
      "deepseek-ai/DeepSeek-V4-Flash-0731"
    );
  });

  test("falls back to default for unknown model", () => {
    expect(resolveSmartModel("not-a-real-model")).toBe("openai/gpt-oss-120b");
    expect(resolveSmartModel("deepseek-ai/DeepSeek-V4-Pro")).toBe("openai/gpt-oss-120b");
    expect(resolveSmartModel("zai-org/GLM-5.2")).toBe("openai/gpt-oss-120b");
  });

  test("maps retired Qwen Max id to Plus", () => {
    expect(resolveSmartModel("Qwen/Qwen3.7-Plus")).toBe("Qwen/Qwen3.7-Plus");
    expect(resolveSmartModel("Qwen/Qwen3.7-Max")).toBe("Qwen/Qwen3.7-Plus");
  });

  test("falls back when candidate is empty", () => {
    expect(resolveSmartModel(undefined)).toBe("openai/gpt-oss-120b");
    expect(resolveSmartModel(null)).toBe("openai/gpt-oss-120b");
  });
});
