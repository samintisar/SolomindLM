import { describe, it, expect } from "vitest";
import {
  isLimitError,
  parseLimitError,
  getLimitErrorMessage,
  getUpgradeMessage,
  parseServiceError,
  parseAppError,
} from "@/shared/utils/errorParser";

describe("isLimitError", () => {
  it("returns true for a structured error with data", () => {
    expect(
      isLimitError({
        data: { code: "DAILY_LIMIT_REACHED", limit: 50, current: 50, limitType: "daily" },
      })
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(isLimitError(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isLimitError("something went wrong")).toBe(false);
  });

  it("returns true for direct limit error properties", () => {
    expect(
      isLimitError({
        code: "NOTEBOOK_LIMIT_REACHED",
        limit: 5,
        current: 5,
        limitType: "notebook",
      })
    ).toBe(true);
  });
});

describe("parseLimitError", () => {
  it("extracts data from Error with structured data", () => {
    const err = new Error("limit");
    (err as any).data = {
      code: "NOTEBOOK_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "notebook",
    };
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("notebook");
    expect(result!.limit).toBe(5);
  });

  it("parses legacy notebook limit string", () => {
    const err = new Error("Notebook limit reached (3/5). Please upgrade.");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("notebook");
    expect(result!.current).toBe(3);
    expect(result!.limit).toBe(5);
    expect(result!.isPro).toBe(false);
  });

  it("parses legacy source limit string", () => {
    const err = new Error("Source limit reached (20/500). Upgrade.");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("source");
    expect(result!.current).toBe(20);
    expect(result!.limit).toBe(500);
    expect(result!.isPro).toBe(true);
  });

  it("returns null for non-limit errors", () => {
    expect(parseLimitError(new Error("something else"))).toBeNull();
    expect(parseLimitError(null)).toBeNull();
  });
});

describe("getLimitErrorMessage", () => {
  it("returns notebook message", () => {
    const msg = getLimitErrorMessage({
      isLimitError: true,
      code: "NOTEBOOK_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "notebook",
      isPro: false,
    });
    expect(msg).toContain("notebook limit");
    expect(msg).toContain("5/5");
  });

  it("returns daily feature message", () => {
    const msg = getLimitErrorMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 50,
      current: 50,
      limitType: "daily",
      feature: "chat",
      isPro: false,
    });
    expect(msg).toContain("chat message");
    expect(msg).toContain("50/50");
  });

  it("returns source message", () => {
    const msg = getLimitErrorMessage({
      isLimitError: true,
      code: "SOURCE_LIMIT_REACHED",
      limit: 20,
      current: 20,
      limitType: "source",
      isPro: false,
    });
    expect(msg).toContain("source limit");
  });
});

describe("getUpgradeMessage", () => {
  it("returns pro contact message for pro users", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "NOTEBOOK_LIMIT_REACHED",
      limit: 100,
      current: 100,
      limitType: "notebook",
      isPro: true,
    });
    expect(msg).toContain("support");
  });

  it("returns upgrade CTA for free users on notebook limit", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "NOTEBOOK_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "notebook",
      isPro: false,
    });
    expect(msg).toContain("100 notebooks");
  });

  it("returns daily pro limits for free daily limit", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 50,
      current: 50,
      limitType: "daily",
      feature: "chat",
      isPro: false,
    });
    expect(msg).toContain("500 messages/day");
  });
});

describe("parseServiceError", () => {
  it("parses EXTERNAL_SERVICE_ERROR", () => {
    const err = { data: { type: "EXTERNAL_SERVICE_ERROR", service: "Tavily", retryable: true } };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("external_service");
    if (result!.kind === "external_service") {
      expect(result!.service).toBe("Tavily");
      expect(result!.retryable).toBe(true);
    }
  });

  it("parses STORAGE_ERROR", () => {
    const err = { data: { type: "STORAGE_ERROR", operation: "upload" } };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("storage");
    if (result!.kind === "storage") {
      expect(result!.operation).toBe("upload");
    }
  });

  it("parses INPUT_VALIDATION_ERROR", () => {
    const err = { data: { type: "INPUT_VALIDATION_ERROR", field: "title", detail: "required" } };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("input_validation");
    if (result!.kind === "input_validation") {
      expect(result!.field).toBe("title");
      expect(result!.detail).toBe("required");
    }
  });

  it("returns null for unknown error types", () => {
    expect(parseServiceError(new Error("generic"))).toBeNull();
    expect(parseServiceError(null)).toBeNull();
  });
});

describe("parseAppError", () => {
  it("returns limit error first when present", () => {
    const err = {
      data: {
        code: "NOTEBOOK_LIMIT_REACHED",
        limit: 5,
        current: 5,
        limitType: "notebook",
      },
    };
    const result = parseAppError(err);
    expect(result).not.toBeNull();
    expect("isLimitError" in result! && result!.isLimitError).toBe(true);
  });

  it("returns null when neither limit nor service error", () => {
    expect(parseAppError(new Error("unknown"))).toBeNull();
  });
});
