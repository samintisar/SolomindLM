import { describe, it, expect } from "vitest";
import {
  isLimitError,
  parseLimitError,
  getLimitErrorMessage,
  getUpgradeMessage,
  parseServiceError,
  getServiceErrorMessage,
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

  it("returns false when missing required fields", () => {
    expect(isLimitError({})).toBe(false);
    expect(isLimitError({ code: "NOTEBOOK_LIMIT_REACHED" })).toBe(false);
    expect(isLimitError({ limit: 5, current: 5, limitType: "notebook" })).toBe(false);
  });

  it("returns false for non-object values", () => {
    expect(isLimitError(undefined)).toBe(false);
    expect(isLimitError(42)).toBe(false);
  });
});

describe("parseLimitError", () => {
  it("extracts data from Error with structured data", () => {
    const err = new Error("limit");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    expect(result!.current).toBe(5);
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

  it("parses legacy daily limit string for chat", () => {
    const err = new Error("Daily chat limit reached (50/50).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("daily");
    expect(result!.feature).toBe("chat");
    expect(result!.limit).toBe(50);
    expect(result!.isPro).toBe(false);
  });

  it("parses legacy daily limit string for flashcard", () => {
    const err = new Error("Daily flashcard limit reached (5/5).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("flashcard");
  });

  it("parses legacy daily limit string for quiz", () => {
    const err = new Error("Daily quiz limit reached (100/100).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("quiz");
    expect(result!.isPro).toBe(true);
  });

  it("parses legacy daily limit string for report", () => {
    const err = new Error("Daily report limit reached (5/5).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("report");
  });

  it("parses legacy daily limit string for audio", () => {
    const err = new Error("Daily audio limit reached (1/1).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("audio");
  });

  it("parses legacy daily limit string for written question", () => {
    const err = new Error("Daily written question limit reached (5/5).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("writtenQuestion");
  });

  it("parses legacy daily limit string for spreadsheet", () => {
    const err = new Error("Daily spreadsheet limit reached (5/5).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("spreadsheet");
  });

  it("parses legacy daily limit string for infographic", () => {
    const err = new Error("Daily infographic limit reached (5/5).");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.feature).toBe("infographic");
  });

  it("parses legacy notebook limit with 'limit reached (N)' format", () => {
    const err = new Error("Notebook limit reached (5)");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("notebook");
    expect(result!.limit).toBe(5);
    expect(result!.current).toBe(5);
  });

  it("parses legacy source limit with 'limit reached (N)' format", () => {
    const err = new Error("Source limit reached (200)");
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("source");
    expect(result!.limit).toBe(200);
    expect(result!.current).toBe(200);
  });

  it("parses structured limit from Error with data property", () => {
    const err = new Error("limit");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).data = {
      code: "DAILY_LIMIT_REACHED",
      limit: 50,
      current: 50,
      limitType: "daily",
      feature: "chat",
      isPro: false,
    };
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("daily");
    expect(result!.feature).toBe("chat");
  });

  it("parses structured limit from plain object with direct properties", () => {
    const err = {
      code: "SOURCE_LIMIT_REACHED",
      limit: 200,
      current: 200,
      limitType: "source",
      isPro: true,
    };
    const result = parseLimitError(err);
    expect(result).not.toBeNull();
    expect(result!.limitType).toBe("source");
    expect(result!.isPro).toBe(true);
  });

  it("returns null for non-limit errors", () => {
    expect(parseLimitError(new Error("something else"))).toBeNull();
    expect(parseLimitError(null)).toBeNull();
    expect(parseLimitError(undefined)).toBeNull();
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
    expect(msg).toContain("20/20");
  });

  it("returns daily feature message for chat", () => {
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

  it("returns daily feature message for audio overview", () => {
    const msg = getLimitErrorMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 100,
      current: 100,
      limitType: "daily",
      feature: "audio",
      isPro: true,
    });
    expect(msg).toContain("audio overview");
  });

  it("returns daily feature message for written question set", () => {
    const msg = getLimitErrorMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "writtenQuestion",
      isPro: false,
    });
    expect(msg).toContain("written question set");
  });

  it("returns generic message when feature is missing for daily limit", () => {
    const msg = getLimitErrorMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 50,
      current: 50,
      limitType: "daily",
      isPro: false,
    });
    expect(msg).toContain("You've reached a limit");
  });
});

describe("getUpgradeMessage", () => {
  it("returns pro contact message for pro users on daily limit", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 500,
      current: 500,
      limitType: "daily",
      feature: "chat",
      isPro: true,
    });
    expect(msg).toContain("refreshes on a rolling day");
  });

  it("returns pro contact message for pro users on non-daily limit", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "NOTEBOOK_LIMIT_REACHED",
      limit: 100,
      current: 100,
      limitType: "notebook",
      isPro: true,
    });
    expect(msg).toContain("Contact support");
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

  it("returns source-specific message for free users on source limit", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "SOURCE_LIMIT_REACHED",
      limit: 20,
      current: 20,
      limitType: "source",
      isPro: false,
    });
    expect(msg).toContain("remove one from this notebook");
  });

  it("returns daily pro limits for free daily limit (chat)", () => {
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

  it("returns daily pro limits for free daily limit (flashcard)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "flashcard",
      isPro: false,
    });
    expect(msg).toContain("100 flashcard sets/day");
  });

  it("returns daily pro limits for free daily limit (quiz)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "quiz",
      isPro: false,
    });
    expect(msg).toContain("100 quizzes/day");
  });

  it("returns daily pro limits for free daily limit (report)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "report",
      isPro: false,
    });
    expect(msg).toContain("100 reports/day");
  });

  it("returns daily pro limits for free daily limit (audio)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 1,
      current: 1,
      limitType: "daily",
      feature: "audio",
      isPro: false,
    });
    expect(msg).toContain("100 audio overviews/day");
  });

  it("returns daily pro limits for free daily limit (writtenQuestion)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "writtenQuestion",
      isPro: false,
    });
    expect(msg).toContain("100 question sets/day");
  });

  it("returns daily pro limits for free daily limit (spreadsheet)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "spreadsheet",
      isPro: false,
    });
    expect(msg).toContain("100 spreadsheets/day");
  });

  it("returns daily pro limits for free daily limit (infographic)", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 5,
      current: 5,
      limitType: "daily",
      feature: "infographic",
      isPro: false,
    });
    expect(msg).toContain("100 infographics/day");
  });

  it("returns generic upgrade message when feature is missing", () => {
    const msg = getUpgradeMessage({
      isLimitError: true,
      code: "DAILY_LIMIT_REACHED",
      limit: 50,
      current: 50,
      limitType: "daily",
      isPro: false,
    });
    expect(msg).toContain("Upgrade to Pro");
  });
});

describe("parseServiceError", () => {
  it("parses EXTERNAL_SERVICE_ERROR with all fields", () => {
    const err = {
      data: {
        type: "EXTERNAL_SERVICE_ERROR",
        service: "Tavily",
        retryable: true,
        statusCode: 503,
        endpoint: "/search",
        detail: "Service down",
      },
    };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("external_service");
    if (result!.kind === "external_service") {
      expect(result!.service).toBe("Tavily");
      expect(result!.retryable).toBe(true);
      expect(result!.statusCode).toBe(503);
      expect(result!.endpoint).toBe("/search");
      expect(result!.detail).toBe("Service down");
    }
  });

  it("parses EXTERNAL_SERVICE_ERROR with minimal fields", () => {
    const err = {
      data: { type: "EXTERNAL_SERVICE_ERROR", service: "OpenAI", retryable: false },
    };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    if (result!.kind === "external_service") {
      expect(result!.service).toBe("OpenAI");
      expect(result!.retryable).toBe(false);
      expect(result!.statusCode).toBeUndefined();
      expect(result!.endpoint).toBeUndefined();
      expect(result!.detail).toBeUndefined();
    }
  });

  it("returns null for EXTERNAL_SERVICE_ERROR with missing required fields", () => {
    const err = { data: { type: "EXTERNAL_SERVICE_ERROR", service: "Tavily" } };
    const result = parseServiceError(err);
    expect(result).toBeNull();
  });

  it("parses STORAGE_ERROR with all fields", () => {
    const err = {
      data: {
        type: "STORAGE_ERROR",
        operation: "upload",
        fileName: "doc.pdf",
        storageId: "storage-123",
        detail: "File too large",
      },
    };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    if (result!.kind === "storage") {
      expect(result!.operation).toBe("upload");
      expect(result!.fileName).toBe("doc.pdf");
      expect(result!.storageId).toBe("storage-123");
      expect(result!.detail).toBe("File too large");
    }
  });

  it("returns null for STORAGE_ERROR with missing operation", () => {
    const err = { data: { type: "STORAGE_ERROR" } };
    const result = parseServiceError(err);
    expect(result).toBeNull();
  });

  it("parses INPUT_VALIDATION_ERROR with all fields", () => {
    const err = {
      data: { type: "INPUT_VALIDATION_ERROR", field: "title", detail: "required" },
    };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    if (result!.kind === "input_validation") {
      expect(result!.field).toBe("title");
      expect(result!.detail).toBe("required");
    }
  });

  it("parses INPUT_VALIDATION_ERROR with minimal fields", () => {
    const err = { data: { type: "INPUT_VALIDATION_ERROR" } };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    if (result!.kind === "input_validation") {
      expect(result!.field).toBeUndefined();
      expect(result!.detail).toBeUndefined();
    }
  });

  it("returns null for unknown error types", () => {
    expect(parseServiceError(new Error("generic"))).toBeNull();
    expect(parseServiceError(null)).toBeNull();
    expect(parseServiceError(undefined)).toBeNull();
  });

  it("returns null for unknown type string", () => {
    const err = { data: { type: "UNKNOWN_TYPE" } };
    expect(parseServiceError(err)).toBeNull();
  });

  it("parses from Error with data property", () => {
    const err = new Error("service error");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).data = {
      type: "EXTERNAL_SERVICE_ERROR",
      service: "TogetherAI",
      retryable: true,
    };
    const result = parseServiceError(err);
    expect(result).not.toBeNull();
    if (result!.kind === "external_service") {
      expect(result!.service).toBe("TogetherAI");
    }
  });
});

describe("getServiceErrorMessage", () => {
  it("returns detail for external service when available", () => {
    const msg = getServiceErrorMessage({
      kind: "external_service",
      service: "Tavily",
      retryable: true,
      detail: "Custom error detail",
    });
    expect(msg).toBe("Custom error detail");
  });

  it("returns retryable message for external service without detail", () => {
    const msg = getServiceErrorMessage({
      kind: "external_service",
      service: "Tavily",
      retryable: true,
    });
    expect(msg).toContain("Tavily is temporarily unavailable");
    expect(msg).toContain("Try again");
  });

  it("returns non-retryable message for external service without detail", () => {
    const msg = getServiceErrorMessage({
      kind: "external_service",
      service: "Tavily",
      retryable: false,
    });
    expect(msg).toContain("Tavily is temporarily unavailable");
    expect(msg).not.toContain("Try again");
  });

  it("returns detail for storage error when available", () => {
    const msg = getServiceErrorMessage({
      kind: "storage",
      operation: "upload",
      detail: "Disk full",
    });
    expect(msg).toBe("Disk full");
  });

  it("returns default storage message without detail", () => {
    const msg = getServiceErrorMessage({
      kind: "storage",
      operation: "download",
    });
    expect(msg).toBe("Storage download failed.");
  });

  it("returns detail for input validation when available", () => {
    const msg = getServiceErrorMessage({
      kind: "input_validation",
      field: "email",
      detail: "Invalid format",
    });
    expect(msg).toBe("Invalid format");
  });

  it("returns default input validation message without detail", () => {
    const msg = getServiceErrorMessage({
      kind: "input_validation",
    });
    expect(msg).toBe("Invalid input.");
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

  it("returns service error when no limit error", () => {
    const err = {
      data: { type: "EXTERNAL_SERVICE_ERROR", service: "Tavily", retryable: true },
    };
    const result = parseAppError(err);
    expect(result).not.toBeNull();
    expect("kind" in result! && result!.kind).toBe("external_service");
  });

  it("returns null when neither limit nor service error", () => {
    expect(parseAppError(new Error("unknown"))).toBeNull();
    expect(parseAppError(null)).toBeNull();
    expect(parseAppError({})).toBeNull();
  });

  it("returns limit error from Error with data", () => {
    const err = new Error("limit");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).data = {
      code: "DAILY_LIMIT_REACHED",
      limit: 50,
      current: 50,
      limitType: "daily",
      feature: "chat",
      isPro: false,
    };
    const result = parseAppError(err);
    expect(result).not.toBeNull();
    expect("isLimitError" in result! && result!.isLimitError).toBe(true);
  });
});
