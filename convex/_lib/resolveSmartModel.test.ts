import { describe, expect, test } from "vitest";
import {
  AVAILABLE_SMART_MODELS,
  DEFAULT_SMART_MODEL_ID as WEB_DEFAULT,
} from "../../apps/web/src/shared/constants/models";
import {
  AVAILABLE_SMART_MODEL_IDS,
  DEFAULT_SMART_MODEL_ID,
  resolveSmartModel,
} from "./resolveSmartModel";

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
  });

  test("maps saved GLM 5.2 notebooks to GLM 5.3 Flash", () => {
    expect(resolveSmartModel("zai-org/GLM-5.2")).toBe("zai-org/GLM-5.3-Flash");
  });

  test("web picker IDs match backend whitelist", () => {
    expect(WEB_DEFAULT).toBe(DEFAULT_SMART_MODEL_ID);
    expect(AVAILABLE_SMART_MODELS.map((model) => model.id)).toEqual([...AVAILABLE_SMART_MODEL_IDS]);
  });

  test("falls back when candidate is empty", () => {
    expect(resolveSmartModel(undefined)).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
    expect(resolveSmartModel(null)).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");
  });
});
