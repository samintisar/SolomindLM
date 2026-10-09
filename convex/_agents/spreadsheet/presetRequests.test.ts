import { describe, expect, it } from "vitest";
import { resolveSpreadsheetRequest, SPREADSHEET_PRESET_REQUESTS } from "./presetRequests";

describe("resolveSpreadsheetRequest", () => {
  it("runs an unedited preset with its own request and no topic narrowing", () => {
    for (const [type, request] of Object.entries(SPREADSHEET_PRESET_REQUESTS)) {
      expect(resolveSpreadsheetRequest(type, request)).toEqual({ request, topic: undefined });
    }
  });

  it("gives a preset started with an empty prompt the same request", () => {
    expect(resolveSpreadsheetRequest("comparison_table", "")).toEqual({
      request: SPREADSHEET_PRESET_REQUESTS.comparison_table,
      topic: undefined,
    });
    expect(resolveSpreadsheetRequest("timeline", undefined)).toEqual({
      request: SPREADSHEET_PRESET_REQUESTS.timeline,
      topic: undefined,
    });
  });

  it("treats an edited preset as the user's own request and narrows to it", () => {
    expect(resolveSpreadsheetRequest("financial_summary", " Revenue only ")).toEqual({
      request: "Revenue only",
      topic: "Revenue only",
    });
  });

  it("uses a custom prompt as both request and topic", () => {
    expect(resolveSpreadsheetRequest("custom", "Compare these papers")).toEqual({
      request: "Compare these papers",
      topic: "Compare these papers",
    });
  });

  it("leaves an empty custom request empty, with no topic", () => {
    expect(resolveSpreadsheetRequest("custom", "")).toEqual({ request: "", topic: undefined });
  });

  it("keeps every preset request free of double quotes, which the reduce prompt wraps it in", () => {
    for (const request of Object.values(SPREADSHEET_PRESET_REQUESTS)) {
      expect(request).not.toContain('"');
    }
  });
});
