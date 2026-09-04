import { resolveSmartModel } from "@convex/_lib/resolveSmartModel";
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

  test("lists Qwen 3.8 Flash instead of Qwen 3.7 Max", () => {
    expect(findSmartModelById("Qwen/Qwen3.8-Flash")).toMatchObject({
      id: "Qwen/Qwen3.8-Flash",
      name: "Qwen3.8 Flash",
      brand: "qwen",
    });
    expect(findSmartModelById("Qwen/Qwen3.7-Max")).toBeUndefined();
  });

  test("picker row for a saved Qwen 3.7 notebook is Qwen 3.8 Flash", () => {
    expect(findSmartModelById(resolveSmartModel("Qwen/Qwen3.7-Max"))?.id).toBe(
      "Qwen/Qwen3.8-Flash"
    );
  });

  test("picker row for a saved GLM 5.2 notebook is GLM 5.3 Flash", () => {
    expect(findSmartModelById(resolveSmartModel("zai-org/GLM-5.2"))?.id).toBe(
      "zai-org/GLM-5.3-Flash"
    );
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
