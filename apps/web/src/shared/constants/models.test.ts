import { describe, expect, test } from "vitest";
import { AVAILABLE_SMART_MODELS, DEFAULT_SMART_MODEL_ID, findSmartModelById } from "./models";

describe("smart model catalog", () => {
  test("defaults chat to DeepSeek V4 Flash", () => {
    expect(DEFAULT_SMART_MODEL_ID).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
    expect(AVAILABLE_SMART_MODELS[0]?.id).toBe(DEFAULT_SMART_MODEL_ID);
  });

  test("lists GLM 5.3 Flash instead of GLM 5.2", () => {
    expect(findSmartModelById("zai-org/GLM-5.3-Flash")?.id).toBe("zai-org/GLM-5.3-Flash");
    expect(findSmartModelById("zai-org/GLM-5.2")).toBeUndefined();
  });
});

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
